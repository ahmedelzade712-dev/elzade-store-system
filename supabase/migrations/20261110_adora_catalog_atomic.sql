-- Adora Catalog Closure | apply ONCE in the linked Supabase SQL editor.
-- Both procedures are single PostgreSQL transactions.
-- Only the Vercel server's service_role may execute them.
-- Existing products, orders, stock quantities and catalog entries are not migrated.

CREATE OR REPLACE FUNCTION public.erp_create_product_with_code(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_store uuid := (p->>'store_id')::uuid;
  v_product uuid;
  v_design text := upper(btrim(p->>'design_code'));
  v_brand text := btrim(p->>'brand_name');
  v_color text := btrim(p->>'color');
  v_code text;
  v_size jsonb;
  v_used text[];
  v_number integer;
  v_price numeric := (p->>'sale_price')::numeric;
  v_cost numeric := (p->>'cost_price')::numeric;
  v_count integer := 0;
BEGIN
  IF v_design !~ '^[A-Z]$' OR nullif(v_brand,'') IS NULL OR nullif(v_color,'') IS NULL THEN
    RAISE EXCEPTION 'INVALID_CATALOG_IDENTITY';
  END IF;
  IF nullif(btrim(p->>'name'),'') IS NULL OR nullif(btrim(p->>'product_type'),'') IS NULL
     OR nullif(btrim(p->>'fabric'),'') IS NULL OR nullif(btrim(p->>'image_url'),'') IS NULL
     OR v_price < 0 OR v_cost < 0 OR v_price IS NULL OR v_cost IS NULL
     OR jsonb_typeof(p->'sizes') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p->'sizes') = 0 THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_DATA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id=v_store) THEN
    RAISE EXCEPTION 'INVALID_STORE';
  END IF;
  -- Lock the *design*, so concurrent product creation cannot allocate the same next code.
  PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_design));
  IF EXISTS (SELECT 1 FROM public.agent_product_codes c
             WHERE c.design_code=v_design AND lower(btrim(c.brand_name))<>lower(v_brand)) THEN
    RAISE EXCEPTION 'DESIGN_BRAND_CONFLICT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_product_codes c
             WHERE c.design_code=v_design AND lower(btrim(c.color_name))=lower(v_color)) THEN
    RAISE EXCEPTION 'DESIGN_COLOR_EXISTS';
  END IF;
  SELECT array_agg(code) INTO v_used FROM public.agent_product_codes WHERE design_code=v_design;
  SELECT v_design || lpad(n::text,2,'0') INTO v_code
  FROM generate_series(1,999999) n
  WHERE NOT ((v_design || lpad(n::text,2,'0')) = ANY(coalesce(v_used, ARRAY[]::text[])))
  ORDER BY n LIMIT 1;
  IF v_code IS NULL THEN RAISE EXCEPTION 'DESIGN_CODES_EXHAUSTED'; END IF;

  INSERT INTO public.products (
    store_id, sku, design_code, name, model, description, visual_features,
    product_type, fabric, main_image_url, default_cost_price, default_sale_price, is_active
  ) VALUES (
    v_store, coalesce(nullif(btrim(p->>'sku'),''),'PRD-'||extract(epoch from clock_timestamp())::bigint::text),
    v_design, btrim(p->>'name'), nullif(btrim(p->>'model'),''),
    coalesce(p->>'description',''), coalesce(p->>'visual_features',''),
    btrim(p->>'product_type'), btrim(p->>'fabric'), p->>'image_url', v_cost, v_price, true
  ) RETURNING id INTO v_product;

  FOR v_size IN SELECT value FROM jsonb_array_elements(p->'sizes')
  LOOP
    IF nullif(btrim(v_size->>'size'),'') IS NULL
       OR (v_size->>'quantity')::integer <= 0 THEN
      RAISE EXCEPTION 'INVALID_SIZE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE product_id=v_product AND size=btrim(v_size->>'size')
    ) THEN RAISE EXCEPTION 'DUPLICATE_SIZE'; END IF;
    INSERT INTO public.product_variants (
      store_id, product_id, color, size, stock_quantity, cost_price, sale_price, image_url, is_active
    ) VALUES (
      v_store, v_product, v_color, btrim(v_size->>'size'),
      (v_size->>'quantity')::integer, v_cost, v_price, p->>'image_url', true
    );
    v_count := v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'INVALID_SIZE'; END IF;
  INSERT INTO public.agent_product_codes (code,design_code,brand_name,color_name,product_id,is_active)
  VALUES (v_code,v_design,v_brand,v_color,v_product,true);
  RETURN jsonb_build_object('product_id',v_product,'code',v_code,'size_count',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_product_with_code(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_product uuid := (p->>'product_id')::uuid;
  v_store uuid := (p->>'store_id')::uuid;
  v_design text := upper(btrim(p->>'design_code'));
  v_brand text := btrim(p->>'brand_name');
  v_color text := btrim(p->>'color');
  v_price numeric := (p->>'sale_price')::numeric;
  v_cost numeric := (p->>'cost_price')::numeric;
  v_code text;
  v_old public.agent_product_codes%ROWTYPE;
  v_number integer;
BEGIN
  IF v_design !~ '^[A-Z]$' OR nullif(v_brand,'') IS NULL OR nullif(v_color,'') IS NULL
     OR nullif(btrim(p->>'name'),'') IS NULL OR nullif(btrim(p->>'product_type'),'') IS NULL
     OR v_price IS NULL OR v_cost IS NULL OR v_price<0 OR v_cost<0 THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_DATA';
  END IF;
  PERFORM 1 FROM public.products WHERE id=v_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id=v_store) THEN
    RAISE EXCEPTION 'INVALID_STORE';
  END IF;
  -- The existing ERP uses one color per product. Reject any multi-color historical product.
  IF (SELECT count(DISTINCT color) FROM public.product_variants WHERE product_id=v_product) <> 1 THEN
    RAISE EXCEPTION 'PRODUCT_HAS_MULTIPLE_COLORS';
  END IF;
  -- Prevent deadlock by locking both design keys in alphabetical order if changed.
  SELECT * INTO v_old FROM public.agent_product_codes WHERE product_id=v_product FOR UPDATE;
  IF FOUND AND v_old.design_code <> v_design THEN
    IF v_old.design_code < v_design THEN
      PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_old.design_code));
      PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_design));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_design));
      PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_old.design_code));
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('elzade-agent-design:'||v_design));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_product_codes c WHERE c.design_code=v_design
    AND c.product_id<>v_product AND lower(btrim(c.brand_name))<>lower(v_brand)
  ) THEN RAISE EXCEPTION 'DESIGN_BRAND_CONFLICT'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.agent_product_codes c WHERE c.design_code=v_design
    AND c.product_id<>v_product AND lower(btrim(c.color_name))=lower(v_color)
  ) THEN RAISE EXCEPTION 'DESIGN_COLOR_EXISTS'; END IF;
  IF v_old.id IS NOT NULL AND v_old.design_code=v_design THEN
    v_code := v_old.code;
  ELSE
    SELECT v_design || lpad(n::text,2,'0') INTO v_code
    FROM generate_series(1,999999) n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.agent_product_codes c WHERE c.code=v_design||lpad(n::text,2,'0')
    ) ORDER BY n LIMIT 1;
    IF v_code IS NULL THEN RAISE EXCEPTION 'DESIGN_CODES_EXHAUSTED'; END IF;
  END IF;

  UPDATE public.products SET
    store_id=v_store, sku=nullif(btrim(p->>'sku'),''),
    design_code=v_design, name=btrim(p->>'name'),
    model=nullif(btrim(p->>'model'),''),
    description=coalesce(p->>'description',''),
    visual_features=coalesce(p->>'visual_features',''),
    product_type=p->>'product_type', fabric=nullif(btrim(p->>'fabric'),''),
    main_image_url=nullif(p->>'image_url',''),
    default_cost_price=v_cost, default_sale_price=v_price
  WHERE id=v_product;
  UPDATE public.product_variants SET
    store_id=v_store, color=v_color, cost_price=v_cost, sale_price=v_price,
    image_url=nullif(p->>'image_url','')
  WHERE product_id=v_product;
  -- IMPORTANT: stock_quantity and historic order rows are never touched.
  IF v_old.id IS NOT NULL THEN
    UPDATE public.agent_product_codes SET
      code=v_code,design_code=v_design,brand_name=v_brand,color_name=v_color,
      is_active=coalesce((p->>'is_active')::boolean,true)
    WHERE id=v_old.id;
  ELSE
    INSERT INTO public.agent_product_codes (code,design_code,brand_name,color_name,product_id,is_active)
    VALUES (v_code,v_design,v_brand,v_color,v_product,coalesce((p->>'is_active')::boolean,true));
  END IF;
  RETURN jsonb_build_object('product_id',v_product,'code',v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_create_product_with_code(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_update_product_with_code(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_product_with_code(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.erp_update_product_with_code(jsonb) TO service_role;
