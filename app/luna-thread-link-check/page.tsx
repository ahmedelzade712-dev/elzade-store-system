"use client";

import { useState } from "react";
import { businessSuiteThreadUrl, parseAdoraBusinessSuiteThreadUrl, type LunaChannel } from "@/lib/lunaThreadLinks";

export default function LunaThreadLinkCheck() {
  const [copiedUrl, setCopiedUrl] = useState("");
  const [channel, setChannel] = useState<LunaChannel>("messenger");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState("");

  function importCopiedUrl() {
    try {
      const match = parseAdoraBusinessSuiteThreadUrl(copiedUrl);
      setChannel(match.channel);
      setSelectedItemId(match.selectedItemId);
      setGenerated(businessSuiteThreadUrl(match));
      setMessage("تم تحليل رابط المحادثة من Adora. افتح الرابط الناتج وتأكد أنه يصل إلى نفس المحادثة.");
    } catch {
      setGenerated("");
      setMessage("الرابط غير صالح أو لا يخص Business Suite لحساب Adora.");
    }
  }

  function build() {
    try {
      setGenerated(businessSuiteThreadUrl({channel,selectedItemId}));
      setMessage("رابط جاهز للاختبار، وليس إثباتًا بأن selected_item_id يساوي sender_id من Meta.");
    } catch {
      setGenerated("");
      setMessage("أدخل معرّف selected_item_id رقميًا كما يظهر في رابط المحادثة الأصلي.");
    }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">Luna — اختبار رابط المحادثة المباشر</h1>
      <p className="text-sm opacity-75">
        هذه الصفحة لا تحفظ البيانات ولا تستخدم صلاحيات Meta ولا ترسل رسائل. معرفات Instagram الطويلة تُعامل كنصوص للحفاظ على دقتها.
      </p>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">1. اختبار رابط منسوخ من Meta Business Suite</h2>
        <label htmlFor="original-thread-url">رابط المحادثة الكامل</label>
        <textarea id="original-thread-url" aria-label="رابط المحادثة الكامل" rows={3} dir="ltr"
          value={copiedUrl} onChange={e=>setCopiedUrl(e.target.value)}
          placeholder="https://business.facebook.com/latest/inbox/all/?..." className="w-full rounded border bg-transparent p-2" />
        <button type="button" onClick={importCopiedUrl} className="rounded bg-blue-700 px-4 py-2 text-white">تحليل الرابط</button>
      </section>
      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">2. توليد رابط من المعرف المختار</h2>
        <label htmlFor="thread-channel">القناة</label>
        <select id="thread-channel" value={channel} onChange={e=>setChannel(e.target.value as LunaChannel)}
          className="block rounded border bg-transparent p-2">
          <option className="text-black" value="messenger">Messenger</option>
          <option className="text-black" value="instagram">Instagram</option>
        </select>
        <label htmlFor="selected-thread-id" className="block">selected_item_id من Business Suite</label>
        <input id="selected-thread-id" dir="ltr" value={selectedItemId}
          onChange={e=>setSelectedItemId(e.target.value)}
          className="block w-full rounded border bg-transparent p-2" />
        <button type="button" onClick={build} className="rounded bg-blue-700 px-4 py-2 text-white">إنشاء الرابط</button>
        {message && <p role="status" className="text-sm">{message}</p>}
        {generated && <div className="space-y-2 break-all rounded border p-3">
          <a href={generated} target="_blank" rel="noopener noreferrer" className="underline">
            فتح المحادثة المختارة في Meta Business Suite
          </a>
          <p dir="ltr" className="text-xs opacity-70">{generated}</p>
        </div>}
      </section>
      <p className="text-sm opacity-75">
        التحقق التالي الإلزامي قبل استخدام Luna للروابط: مطابقة sender.id أو conversation.id المأخوذ من Graph API
        مع selected_item_id الحقيقي. لا تستخدم sender.id باعتباره selected_item_id دون هذا الاختبار.
      </p>
    </main>
  );
}
