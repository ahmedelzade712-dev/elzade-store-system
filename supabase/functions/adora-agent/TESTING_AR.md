# اختبار Adora Agent قبل التشغيل الحقيقي

## تأكدنا من GitHub
هذا الفرع يضيف `supabase/functions/adora-agent/index.ts` وتعليماته وفحص البنية الآمن. **الرفع إلى GitHub لا يعني أن الوظيفة منشورة في Supabase.**

## ما الذي يمكن اختباره؟
بعد التأكد من أسماء أعمدة قاعدة البيانات وتوفير `OPENAI_API_KEY` في **Supabase Secrets** يمكن اختبار قدرة النموذج على:
- فهم سؤال عن السعر والمقاس باستخدام بيانات ERP الموثقة.
- متابعة محادثة بعد 4 أيام باستخدام الرسائل المسجلة خلال 30 يومًا.
- فهم طلب تعديل المقاس وطلب فحص حالة الطلب بدل التغيير الآلي.
- تحويل مرفق غير مفهوم أو طلب خدمة بشرية للموظف.

النسخة الحالية **وضع Preview فقط**: لا ترسل إلى Messenger أو Instagram، لا تعدل ERP، ولا تسجل أن المهمة اكتملت. هذه وظيفة اختيارية للقراءة والتحليل، وليست محرك الإنتاج المتكامل.

## فحص البنية قبل النشر (بدون كشف بيانات الزبائن)
نفّذ الملف `supabase/audits/adora_agent_readiness_readonly.sql` في SQL Editor وأرسل أسماء الحقول فقط/نتيجة الفحص. يجب التحقق من `luna_messages` الحقيقي، لأن بنية الرسائل أُنشئت مباشرة في Supabase وقد لا تكون موجودة في ملفات migrations في GitHub.

## استدعاء تجريبي *بعد النشر فقط*
احفظ مفتاح `service_role` محليًا ولا تضعه داخل ملفات أو صور:

```powershell
$url = "https://bmlhmzsziihmovqyaopf.supabase.co/functions/v1/adora-agent"
$secret = Read-Host "Paste service_role" -AsSecureString
$key = [System.Net.NetworkCredential]::new("", $secret).Password.Trim()
$body = @{page_id="589433480926104"; channel="messenger"; sender_id="<TEST_PSID>"; event_id="<TEST_EVENT_ID>"} | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri $url -Headers @{
    Authorization="Bearer $key"; apikey=$key
  } -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
} finally { Remove-Variable key,secret -ErrorAction SilentlyContinue }
```

استخدم فقط معرف حدث مسجّل للاختبار، وليس رسالة عميلة حقيقية. **لا تجرّب قبل فحص البنية ونشر الوظيفة.**

## حالات القبول المطلوب اختبارها
| الحالة | القرار المتوقع |
|---|---|
| سؤال عن D01 ومقاس XL | جواب بسعر/توافر موثق فقط |
| رجوع بعد 4 أيام لإكمال الشراء | فهم المرجع من السياق وعدم اختراع منتج |
| تغيير مقاس طلب موجود | `needs_erp_lookup`، لا تعديل تلقائي |
| صورة بلا كود أو منتج غير مؤكد | `needs_human` |
| محادثة في وضع `human` | `skipped`، لا إجابة |
| حدث سبق التعامل معه | لا إرسال ولا تعديل؛ منع التكرار يحتاج ربطًا إنتاجيًا لاحقًا |

## قيود مهمة
- دعم Instagram والأوامر الخارجة من Webhook لم يكتمل في المحرك.
- حفظ مفتاح API لا يضمن رصيدًا أو وصولًا للنموذج؛ تأكد من صلاحية حساب OpenAI.
- استخدام النموذج لا يغني عن قواعد ERP أو صلاحيات الموظف.
- لا تمزج فرع المراجعة في `main` قبل فحص الأعمدة والاختبارات.

**الترتيب القادم:** تدقيق البنية الفعلية → تصحيح التوافق → إعداد الوظيفة التجريبية → اختبارات Preview → تحديد قواعد القرار → تكامل Webhook/ERP → اختبار شامل.
