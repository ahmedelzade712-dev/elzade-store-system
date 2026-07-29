const MAYAR_GRAPHQL_ENDPOINT =
  process.env.MAYAR_GRAPHQL_ENDPOINT ||
  "https://mayar.lg.accuratess.com:8443/graphql";

const MAYAR_USERNAME = process.env.MAYAR_USERNAME;
const MAYAR_PASSWORD = process.env.MAYAR_PASSWORD;

export const MAYAR_SERVICE_ID = Number(
  process.env.MAYAR_SERVICE_ID || 1
);

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; [key: string]: any }[];
};

export type MayarDropdownEntry = {
  id: number;
  code?: string | null;
  name: string;
};

export type MayarZone = MayarDropdownEntry;

export type MayarServiceFilter = {
  serviceId: number;
  customerTypeCode: string;
  fromZoneId: number;
  fromSubzoneId: number;
};

export type MayarShipmentInput = {
  refNumber?: string;
  recipientName?: string;
  recipientPhone: string;
  recipientMobile: string;
  recipientAddress: string;
  recipientZoneId: number;
  recipientSubzoneId: number;
  price?: number;
  piecesCount?: number;
  returnPiecesCount?: number;
  parcelType?: "full_delivery" | "exchange";
  openable?: boolean;
  notes?: string;
};

function toPositiveInteger(value: unknown, fallback = 1) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

export async function mayarGraphql<T>(
  query: string,
  variables?: Record<string, any>,
  token?: string
): Promise<T> {
  const response = await fetch(MAYAR_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      query,
      variables: variables || {},
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as GraphqlResponse<T>;

  if (!response.ok) {
    throw new Error(
      `Mayar HTTP error ${response.status}: ${JSON.stringify(json)}`
    );
  }

  if (json.errors && json.errors.length > 0) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }

  if (!json.data) {
    throw new Error("Mayar API returned no data");
  }

  return json.data;
}

export async function mayarLogin() {
  if (!MAYAR_USERNAME || !MAYAR_PASSWORD) {
    throw new Error(
      "MAYAR_USERNAME أو MAYAR_PASSWORD غير موجودة في .env.local"
    );
  }

  const query = `
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        token
        user {
          id
          username
          active
        }
      }
    }
  `;

  const data = await mayarGraphql<{
    login: {
      token: string;
      user: {
        id: number;
        username: string;
        active: boolean;
      };
    };
  }>(query, {
    input: {
      username: MAYAR_USERNAME,
      password: MAYAR_PASSWORD,
      rememberMe: true,
    },
  });

  return data.login;
}

export async function mayarListCountries(
  token: string
): Promise<MayarDropdownEntry[]> {
  const query = `
    query ListCountries {
      listCountriesDropdown {
        id
        name
      }
    }
  `;

  const data = await mayarGraphql<{
    listCountriesDropdown: MayarDropdownEntry[];
  }>(query, {}, token);

  return data.listCountriesDropdown || [];
}

export async function mayarListZones(
  token: string,
  input: Record<string, any> = {}
): Promise<MayarZone[]> {
  const query = `
    query ListZones($input: ListZonesFilterInput) {
      listZonesDropdown(input: $input) {
        id
        code
        name
      }
    }
  `;

  const data = await mayarGraphql<{
    listZonesDropdown: MayarZone[];
  }>(query, { input }, token);

  return data.listZonesDropdown || [];
}

export async function mayarListCitiesByCountry(
  token: string,
  countryId: number
): Promise<MayarZone[]> {
  return mayarListZones(token, {
    active: true,
    countryId: Number(countryId),
  });
}

export async function mayarListAreasByCity(
  token: string,
  countryId: number,
  cityId: number
): Promise<MayarZone[]> {
  return mayarListZones(token, {
    active: true,
    countryId: Number(countryId),
    parentId: Number(cityId),
  });
}

export async function mayarListDestinationCities(
  token: string,
  serviceFilter: MayarServiceFilter
) {
  return mayarListZones(token, {
    active: true,
    service: serviceFilter,
  });
}

export async function mayarListDestinationAreas(
  token: string,
  cityId: number,
  serviceFilter: MayarServiceFilter
) {
  return mayarListZones(token, {
    active: true,
    parentId: cityId,
    service: serviceFilter,
  });
}

export async function mayarListShippingServices(token: string) {
  const query = `
    query ListShippingServices($input: ListShippingServicesFilterInput) {
      listShippingServicesDropdown(input: $input) {
        id
        name
      }
    }
  `;

  const data = await mayarGraphql<{
    listShippingServicesDropdown: {
      id: number;
      name: string;
    }[];
  }>(query, { input: { active: true } }, token);

  return data.listShippingServicesDropdown || [];
}

export async function mayarSaveShipment(
  token: string,
  shipmentInput: MayarShipmentInput
) {
  const query = `
    mutation SaveShipment($input: ShipmentInput!) {
      saveShipment(input: $input) {
        id
        code
        trackingUrl
        recipientName
        recipientPhone
        recipientMobile
        recipientAddress
        price
        deliveryFees
        totalAmount
        recipientZone {
          id
          name
        }
        recipientSubzone {
          id
          name
        }
      }
    }
  `;

  const isExchange =
    (shipmentInput.parcelType || "full_delivery") === "exchange";

  const piecesCount = toPositiveInteger(
    shipmentInput.piecesCount,
    1
  );

  const returnPiecesCount = isExchange
    ? Math.max(
        2,
        toPositiveInteger(shipmentInput.returnPiecesCount, 2)
      )
    : 1;

  const input: Record<string, any> = {
    refNumber: shipmentInput.refNumber,
    serviceId: MAYAR_SERVICE_ID,
    recipientName:
      shipmentInput.recipientName || "بدون اسم",
    recipientPhone:
      shipmentInput.recipientPhone,
    recipientMobile:
      shipmentInput.recipientMobile ||
      shipmentInput.recipientPhone,
    recipientAddress:
      shipmentInput.recipientAddress || "-",
    recipientZoneId:
      Number(shipmentInput.recipientZoneId),
    recipientSubzoneId:
      Number(shipmentInput.recipientSubzoneId),
    typeCode: isExchange ? "PDP" : "FDP",
    openableCode:
      shipmentInput.openable === false ? "N" : "Y",
    paymentTypeCode: "COLC",
    priceTypeCode: "EXCLD",
    price: isExchange
      ? 0
      : Number(shipmentInput.price || 0),
    piecesCount,
    returnPiecesCount,
    weight: 1,
    notes: shipmentInput.notes || "",
  };

  console.log("===== MAYAR INPUT START =====");
  console.log(
    JSON.stringify(
      {
        parcelType: shipmentInput.parcelType,
        isExchange,
        piecesCount,
        returnPiecesCount,
        input,
      },
      null,
      2
    )
  );
  console.log("===== MAYAR INPUT END =====");

  const data = await mayarGraphql<{
    saveShipment: {
      id: number;
      code: string;
      trackingUrl: string;
      recipientName: string | null;
      recipientPhone: string | null;
      recipientMobile: string;
      recipientAddress: string;
      price: number;
      deliveryFees: number;
      totalAmount: number;
      recipientZone: {
        id: number;
        name: string;
      };
      recipientSubzone: {
        id: number;
        name: string;
      };
    };
  }>(query, { input }, token);

  return data.saveShipment;
}
