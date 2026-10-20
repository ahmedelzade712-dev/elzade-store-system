/* Adora V3 Pearl safe TEST - only active when URL query adora_v3_preview=1 */
(function(){
  "use strict";
  var enabled=false;
  try{enabled=new URLSearchParams(window.location.search).get("adora_v3_preview")==="1"}catch(_){}
  if(!enabled||window.location.pathname!=="/")return;
  document.documentElement.classList.add("adora-v3-test");
  var icons=[
    '<rect x="2.5" y="7" width="27" height="18" rx="2"/><circle cx="16" cy="16" r="5"/><path d="M7 11v3m18 4v3"/>',
    '<path d="M2 8h17v16H2zM19 13h6l5 6v5H19"/><circle cx="9" cy="25" r="2.5"/><circle cx="25" cy="25" r="2.5"/>',
    '<path d="M26 10H5l5-5M5 10l5 5M6 22h21l-5-5m5 5-5 5"/>',
    '<rect x="3" y="8" width="26" height="16" rx="1"/><path d="M8 8v6m5-6v4m5-4v6m5-6v4"/>'
  ];
  var features=[
    ["الدفع عند الاستلام","داخل ليبيا"],
    ["توصيل سريع","طرابلس خاصة وخارجها عبر المعيار"],
    ["استبدال بسهولة","حسب سياسة المتجر"],
    ["المقاسات M إلى 3XL","مناسبة لمختلف الأجسام"]
  ];
  function makeBenefits(){
    var section=document.createElement("section");
    section.className="adora-v3-benefits";
    section.id="adora-v3-benefits";
    section.setAttribute("dir","rtl");
    section.setAttribute("aria-label","مميزات التسوق في Adora");
    var grid=document.createElement("div");grid.className="adora-v3-benefits-grid";
    features.forEach(function(f,i){
      var item=document.createElement("div");item.className="adora-v3-benefit";
      var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 32 32");
      svg.setAttribute("aria-hidden","true");
      svg.innerHTML=icons[i];
      var text=document.createElement("span");
      var title=document.createElement("b");title.textContent=f[0];
      var desc=document.createElement("small");desc.textContent=f[1];
      text.appendChild(title);text.appendChild(desc);
      item.appendChild(svg);item.appendChild(text);grid.appendChild(item);
    });
    section.appendChild(grid);
    return section;
  }
  function insert(){
    if(document.getElementById("adora-v3-benefits"))return true;
    var main=document.querySelector("main")||document.body;
    var cat=main.querySelector(".ab-categories-track");
    if(cat){
      var ancestor=cat.closest("section");
      if(ancestor && ancestor!==main && !ancestor.contains(main.querySelector(".home_slider_container"))){
        ancestor.insertAdjacentElement("beforebegin",makeBenefits());return true;
      }
      cat.insertAdjacentElement("beforebegin",makeBenefits());return true;
    }
    var hero=main.querySelector(".home_slider_container,.home_slider_slide,.home_banner,.ab-hero,.hero-banner,[data-section='slider']");
    if(hero){
      var section=hero.closest("section")||hero;
      section.insertAdjacentElement("afterend",makeBenefits());return true;
    }
    return false;
  }
  function boot(){
    if(insert())return;
    var obs=new MutationObserver(function(){if(insert())obs.disconnect()});
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(function(){obs.disconnect()},10000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
