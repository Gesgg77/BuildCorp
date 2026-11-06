(() => {
"use strict";

const root = document.getElementById("apiApp");
if (!root) return;
const $ = (id) => document.getElementById(id);
const staff = root.dataset.staff === "true";
let permissionMap = {};
try { permissionMap = JSON.parse(root.dataset.permissions || "{}"); }
catch (_) { permissionMap = {}; }

const defs = {
  herramientas: {
    title: "Herramientas", singular: "herramienta",
    description: "Controla tus activos, conoce su disponibilidad y registra cada movimiento.",
    fields: [
      ["codigo", "Código de herramienta", "text", true],
      ["nombre", "Nombre", "text", true],
      ["estado", "Estado", "select", true, ["disponible", "en_uso", "mantenimiento", "baja"]],
      ["horas_uso", "Horas de uso", "number", true],
      ["fecha_proximo_mantenimiento", "Próximo mantenimiento", "date", false]
    ],
    columns: [["codigo","CÓDIGO"],["nombre","HERRAMIENTA"],["estado","ESTADO"],["horas_uso","HORAS DE USO"],["fecha_proximo_mantenimiento","MANTENIMIENTO"]]
  },
  prestamos: {
    title: "Préstamos", singular: "préstamo",
    description: "Registra entregas y devoluciones, con responsables y fechas claras.",
    fields: [
      ["herramienta","Herramienta","relation",true,"herramientas"],
      ["contratista","Contratista","relation",true,"contratistas"],
      ["fecha_entrega","Fecha de entrega","date",true],
      ["fecha_limite","Fecha límite","date",true],
      ["fecha_devolucion","Fecha devolución","date",false],
      ["firma_responsable","Constancia de recepción","text",true]
    ],
    columns: [["id","N.º"],["herramienta_nombre","HERRAMIENTA"],["contratista_nombre","RESPONSABLE"],["fecha_limite","FECHA LÍMITE"],["atrasado","ATRASADO"],["fecha_devolucion","DEVOLUCIÓN"]]
  },
  contratistas: {
    title: "Contratistas", singular: "contratista",
    description: "Centraliza los responsables de obra y sus permisos de operación.",
    fields: [
      ["nombre","Nombre completo","text",true],
      ["rut","RUT","text",true],
      ["suspendido","Suspendido","checkbox",false]
    ],
    columns: [["nombre","CONTRATISTA"],["rut","RUT"],["moroso","MOROSO"],["suspendido","SUSPENDIDO"]]
  },
  mantenimientos: {
    title: "Mantenimientos", singular: "mantenimiento",
    description: "Programa revisiones, controla vencimientos y evita imprevistos.",
    fields: [
      ["herramienta","Herramienta","relation",true,"herramientas"],
      ["tipo","Tipo de mantenimiento","select",true,["preventivo","correctivo"]],
      ["fecha_programada","Fecha programada","date",true],
      ["fecha_realizada","Fecha realizada","date",false],
      ["descripcion","Descripción","textarea",false]
    ],
    columns: [["id","N.º"],["herramienta","HERRAMIENTA"],["tipo","TIPO"],["fecha_programada","PROGRAMADO"],["fecha_realizada","REALIZADO"],["vencido","VENCIDO"]]
  }
};
const filters = {
  herramientas: [
    ["all","Todos los estados",()=>true],
    ["disponible","Disponibles",x=>x.estado==="disponible"],
    ["en_uso","En uso",x=>x.estado==="en_uso"],
    ["mantenimiento","En mantenimiento",x=>x.estado==="mantenimiento"],
    ["baja","Dados de baja",x=>x.estado==="baja"]
  ],
  prestamos: [
    ["all","Todos los préstamos",()=>true],
    ["abierto","Activos",x=>x.fecha_devolucion==null],
    ["atrasado","Atrasados",x=>Boolean(x.atrasado)],
    ["devuelto","Devueltos",x=>x.fecha_devolucion!=null]
  ],
  contratistas: [
    ["all","Todos los contratistas",()=>true],
    ["vigente","Habilitados",x=>!x.moroso&&!x.suspendido],
    ["moroso","Morosos",x=>Boolean(x.moroso)],
    ["suspendido","Suspendidos",x=>Boolean(x.suspendido)]
  ],
  mantenimientos: [
    ["all","Todos los mantenimientos",()=>true],
    ["pendiente","Pendientes",x=>x.fecha_realizada==null],
    ["vencido","Vencidos",x=>Boolean(x.vencido)],
    ["realizado","Realizados",x=>x.fecha_realizada!=null]
  ]
};
let active="herramientas", rows=[], raw="[]", selectedId=null, editId=null;
let viewMode="table", pending=0, toastHandle=null;
const can=(permission)=>Boolean(permissionMap[active]?.[permission]);
const endpoint=(key)=>"/api/"+key+"/";
const make=(tag,className="",value)=>{const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=String(value);return n;};
const getCookie=(name)=>document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.slice(name.length+1)||"";
const notify=(message)=>{const box=$("toast");box.textContent=String(message);box.hidden=false;clearTimeout(toastHandle);toastHandle=setTimeout(()=>{box.hidden=true;},5000);};
const errorString=(data)=>{
  if(typeof data==="string")return data;
  if(!data||typeof data!=="object")return String(data);
  return Object.entries(data).map(([key,val])=>{
    const msg=Array.isArray(val)?val.join(", "):typeof val==="object"?JSON.stringify(val):String(val);
    return (key==="detail"?"":key+": ")+msg;
  }).join("\n");
};
async function request(path,options={}){
  const headers={Accept:"application/json",...options.headers};
  if(options.method&&options.method!=="GET"){
    const token=getCookie("csrftoken")||$("editorForm")?.querySelector("input[name=csrfmiddlewaretoken]")?.value||"";
    headers["X-CSRFToken"]=decodeURIComponent(token);
    if(options.method!=="DELETE")headers["Content-Type"]="application/json";
  }
  const response=await fetch(path,{credentials:"same-origin",...options,headers});
  if(response.status===204)return null;
  const result=await response.json().catch(()=>({detail:"No se recibió una respuesta JSON válida."}));
  if(!response.ok)throw new Error(errorString(result)||"Error HTTP "+response.status);
  return result;
}
function nice(key,value){
  if(value===null||value===undefined||value==="")return "—";
  if(typeof value==="boolean")return value?"Sí":"No";
  if(key.includes("fecha")&&typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const [year,month,day]=value.split("-");return day+"/"+month+"/"+year;
  }
  if(key==="estado")return String(value).replaceAll("_"," ");
  return String(value);
}
function flag(key,value){
  if(["estado","moroso","suspendido","atrasado","vencido"].includes(key)){
    const chip=make("span","ap-flag",nice(key,value));
    if(value===true||["mantenimiento","baja"].includes(value))chip.classList.add("danger");
    else if(value==="en_uso")chip.classList.add("warn");
    else if(value===false)chip.classList.add("neutral");
    return chip;
  }
  return document.createTextNode(nice(key,value));
}
function statusInfo(row){
  if(active==="herramientas")return ["estado",row.estado];
  if(active==="prestamos")return ["atrasado",row.atrasado];
  if(active==="contratistas")return ["moroso",row.moroso];
  return ["vencido",row.vencido];
}
function friendlyName(row){
  if(active==="herramientas")return row.nombre||"Herramienta";
  if(active==="contratistas")return row.nombre||"Contratista";
  if(active==="prestamos")return row.herramienta_nombre||"Préstamo";
  return "Mantenimiento #"+row.id;
}
function friendlyDetail(row){
  if(active==="herramientas")return row.codigo||"Sin código";
  if(active==="prestamos")return row.contratista_nombre||"Sin responsable";
  if(active==="contratistas")return row.rut||"Sin RUT";
  return nice("fecha_programada",row.fecha_programada);
}
function updateSummary(){
  const total=rows.length;
  let positive=0,attention=0,goodLabel="",badLabel="",goodDetail="",badDetail="";
  if(active==="herramientas"){
    positive=rows.filter(x=>x.estado==="disponible").length;
    attention=rows.filter(x=>["mantenimiento","baja"].includes(x.estado)).length;
    goodLabel="DISPONIBLES";badLabel="REQUIEREN ATENCIÓN";
    goodDetail="Listas para utilizar";badDetail="En mantenimiento o de baja";
  }else if(active==="prestamos"){
    positive=rows.filter(x=>x.fecha_devolucion==null&&!x.atrasado).length;
    attention=rows.filter(x=>x.atrasado).length;
    goodLabel="PRÉSTAMOS VIGENTES";badLabel="DEVOLUCIONES VENCIDAS";
    goodDetail="Activos dentro del plazo";badDetail="Necesitan seguimiento";
  }else if(active==="contratistas"){
    positive=rows.filter(x=>!x.moroso&&!x.suspendido).length;
    attention=rows.filter(x=>x.moroso||x.suspendido).length;
    goodLabel="HABILITADOS";badLabel="BLOQUEADOS";
    goodDetail="Sin morosidad ni suspensión";badDetail="Morosos o suspendidos";
  }else{
    positive=rows.filter(x=>x.fecha_realizada!=null).length;
    attention=rows.filter(x=>x.vencido).length;
    goodLabel="REALIZADOS";badLabel="VENCIDOS";
    goodDetail="Mantenimientos completados";badDetail="Fuera de plazo";
  }
  $("totalCount").textContent=String(total);
  $("availableCount").textContent=String(positive);
  $("attentionCount").textContent=String(attention);
  $("metricHealthyLabel").textContent=goodLabel;
  $("metricAttentionLabel").textContent=badLabel;
  $("metricHealthySub").textContent=goodDetail;
  $("metricAttentionSub").textContent=badDetail;
}
function syncPicker(){
  const select=$("selectedRecord"),old=selectedId==null?"":String(selectedId);
  select.replaceChildren(new Option("Selecciona un registro...",""));
  for(const row of rows){
    select.add(new Option(friendlyName(row)+" · "+friendlyDetail(row),String(row.id)));
  }
  if(old&&rows.some(row=>String(row.id)===old)){
    select.value=old;
  }else{
    selectedId=null;select.value="";
  }
  $("actionPost").disabled=!can("add");
  $("actionPatch").disabled=!can("change");
  $("actionDelete").disabled=!can("delete");
  $("actionPost").title=can("add")?"Crear registro":"Sin permiso para crear";
  $("actionPatch").title=can("change")?"Editar registro":"Sin permiso para modificar";
  $("actionDelete").title=can("delete")?"Eliminar registro":"Sin permiso para eliminar";
  const allowed=[can("add")?"crear":null,can("change")?"editar":null,can("delete")?"eliminar":null].filter(Boolean);
  $("roleHelp").textContent=allowed.length?"Acceso habilitado para: "+allowed.join(", ")+".":"Modo consulta. Tu perfil no permite modificar registros.";
}
function highlightSelection(){
  const key=selectedId==null?"":String(selectedId);
  document.querySelectorAll("[data-row-id]").forEach(row=>{
    const matches=Boolean(key&&row.dataset.rowId===key);
    row.classList.toggle("ap-selected",matches);
    row.classList.toggle("selected",matches);
    if(row.tagName==="TR")row.setAttribute("aria-selected",String(matches));
  });
}
function selectRow(id){
  selectedId=id==null?null:String(id);
  $("selectedRecord").value=selectedId||"";
  highlightSelection();
}
function currentRows(){
  const query=$("searchRecords").value.toLocaleLowerCase("es").trim();
  const option=filters[active].find(item=>item[0]===$("statusFilter").value)||filters[active][0];
  return rows.filter(row=>
    option[2](row) &&
    (!query||Object.values(row).some(value=>String(value??"").toLocaleLowerCase("es").includes(query)))
  );
}
function drawTable(found){
  const head=$("tableHead"),body=$("tableBody");
  const heading=make("tr");
  for(const [,label] of defs[active].columns)heading.append(make("th","",label));
  if(can("change")||can("delete"))heading.append(make("th","","GESTIÓN"));
  head.replaceChildren(heading);
  body.replaceChildren();
  if(!found.length){
    const tr=make("tr"),td=make("td","ap-empty","No hay resultados. Cambia el filtro o crea un nuevo registro.");
    td.colSpan=defs[active].columns.length+((can("change")||can("delete"))?1:0);
    tr.append(td);body.append(tr);return;
  }
  for(const row of found){
    const tr=make("tr");tr.dataset.rowId=String(row.id);tr.tabIndex=0;
    tr.addEventListener("click",()=>selectRow(row.id));
    tr.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();selectRow(row.id);}});
    for(const [field] of defs[active].columns){
      const td=make("td");td.append(flag(field,row[field]));tr.append(td);
    }
    if(can("change")||can("delete")){
      const td=make("td"),actions=make("div","ap-row-actions");
      if(can("change")){
        const edit=make("button","ap-small-btn","Editar");edit.type="button";
        edit.addEventListener("click",ev=>{ev.stopPropagation();selectRow(row.id);openEditor(row);});
        actions.append(edit);
      }
      if(can("delete")){
        const del=make("button","ap-small-btn danger","Eliminar");del.type="button";
        del.addEventListener("click",ev=>{ev.stopPropagation();selectRow(row.id);removeItem(row);});
        actions.append(del);
      }
      td.append(actions);tr.append(td);
    }
    body.append(tr);
  }
}
function drawCards(found){
  const grid=$("cardsGrid");grid.replaceChildren();
  if(!found.length){
    grid.append(make("div","ap-empty","No hay resultados. Cambia el filtro o crea un registro."));
    return;
  }
  for(const row of found){
    const card=make("article","ap-record-card");card.dataset.rowId=String(row.id);card.tabIndex=0;
    const top=make("div","ap-record-top");
    top.append(make("span","ap-record-symbol",active==="herramientas"?"▥":active==="prestamos"?"↗":active==="contratistas"?"♧":"⚙"));
    const [stateKey,stateVal]=statusInfo(row);
    top.append(flag(stateKey,stateVal));
    card.append(top);
    card.append(make("h3","",friendlyName(row)));
    card.append(make("p","",friendlyDetail(row)));
    const meta=make("div","ap-record-meta");
    meta.append(make("span","",active==="herramientas"?"Uso: "+nice("horas_uso",row.horas_uso)+" h":active==="prestamos"?"Límite: "+nice("fecha_limite",row.fecha_limite):active==="contratistas"?"Ficha de responsable":"Tipo: "+nice("tipo",row.tipo)));
    meta.append(make("span","ap-record-cta","Seleccionar ↗"));
    card.append(meta);
    card.addEventListener("click",()=>selectRow(row.id));
    card.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();selectRow(row.id);}});
    grid.append(card);
  }
}
function render(){
  const found=currentRows();
  drawTable(found);drawCards(found);highlightSelection();
  $("tableFooter").textContent="Mostrando "+found.length+" de "+rows.length+" registros";
}
function configureFilter(){
  const box=$("statusFilter");box.replaceChildren();
  for(const option of filters[active])box.add(new Option(option[1],option[0]));
}
async function load(module){
  if(!defs[module])module="herramientas";
  const changed=active!==module;
  active=module;
  if(changed)selectedId=null;
  const info=defs[module];
  $("moduleTitle").textContent=info.title;
  $("breadcrumb").textContent=info.title;
  $("moduleDescription").textContent=info.description;
  $("newBtnLabel").textContent="Nueva "+(module==="herramientas"?"herramienta":module==="prestamos"?"solicitud":module==="contratistas"?"persona":"revisión");
  $("newBtn").hidden=!can("add");
  $("recordsHeading").textContent=info.title+" registradas";
  if(module==="prestamos")$("recordsHeading").textContent="Historial de préstamos";
  else if(module==="contratistas")$("recordsHeading").textContent="Directorio de contratistas";
  else if(module==="mantenimientos")$("recordsHeading").textContent="Agenda de mantenimientos";
  $("apiEndpoint").textContent="GET "+endpoint(module);
  $("openEndpoint").href=endpoint(module);
  $("requestStatus").textContent="Sincronizando";
  $("searchRecords").value="";
  configureFilter();
  document.querySelectorAll(".ap-module").forEach(button=>button.classList.toggle("active",button.dataset.resource===module));
  const params=new URLSearchParams(window.location.search);
  params.set("modulo",module);params.delete("nuevo");
  window.history.replaceState(null,"","/api/?"+params);
  const current=++pending;
  try{
    const data=await request(endpoint(module));
    if(pending!==current)return;
    rows=Array.isArray(data)?data:Array.isArray(data.results)?data.results:[];
    raw=JSON.stringify(data,null,2);
    $("apiResponse").textContent=raw;
    $("requestStatus").textContent="Conectado";
    $("updatedAt").textContent=new Date().toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
    updateSummary();syncPicker();render();
  }catch(error){
    if(pending!==current)return;
    rows=[];raw=JSON.stringify({error:error.message},null,2);
    $("apiResponse").textContent=raw;
    $("requestStatus").textContent="Sin conexión";
    $("updatedAt").textContent="—";
    updateSummary();syncPicker();render();
    notify("No fue posible cargar registros: "+error.message);
  }
}
function makeField(field,value,relationOptions){
  const [key,label,type,required]=field;
  const wrapper=make("div","ap-field"),caption=make("label","",label+(required?" *":""));
  caption.htmlFor="field_"+key;wrapper.append(caption);
  let input;
  if(type==="select"||type==="relation"){
    input=make("select");
    const options=type==="select"?(field[4]||[]).map(choice=>({value:choice,text:choice.replaceAll("_"," ")})):relationOptions;
    if(type==="relation"||!required)input.add(new Option(type==="relation"?"Selecciona una opción…":"Sin asignar",""));
    for(const choice of options)input.add(new Option(choice.text,choice.value));
  }else if(type==="textarea")input=make("textarea");
  else{
    input=make("input");input.type=type;
    if(type==="number"){input.min="0";input.step="1";}
    if(type==="checkbox")input.checked=Boolean(value);
  }
  input.id="field_"+key;input.name=key;
  if(required&&type!=="checkbox")input.required=true;
  if(value!==null&&value!==undefined&&type!=="checkbox")input.value=String(value);
  wrapper.append(input);return wrapper;
}
async function openEditor(row=null){
  if(!staff||!can(row?"change":"add"))return;
  const targetModule=active;
  editId=row?.id||null;
  $("editorError").hidden=true;$("editorError").textContent="";
  $("editorTitle").textContent=editId?"Editar "+defs[active].singular:"Nueva "+defs[active].singular;
  $("editorSubtitle").textContent="Los cambios se guardan directamente en BuildCorp.";
  const fields=$("editorFields");fields.replaceChildren();
  for(const field of defs[active].fields){
    let options=[];
    if(field[2]==="relation"){
      try{
        const data=await request(endpoint(field[4]));
        if(targetModule!==active)return;
        const list=Array.isArray(data)?data:data.results||[];
        options=list.map(item=>({value:item.id,text:item.codigo?item.codigo+" · "+item.nombre:item.nombre||String(item.id)}));
      }catch(error){notify("No se pueden cargar opciones: "+error.message);return;}
    }
    fields.append(makeField(field,row?.[field[0]],options));
  }
  $("editorWrap").hidden=false;
  document.body.style.overflow="hidden";
  fields.querySelector("input,select,textarea")?.focus();
}
function closeEditor(){
  $("editorWrap").hidden=true;document.body.style.overflow="";
}
async function save(event){
  event.preventDefault();
  const form=$("editorForm");
  if(!form.reportValidity())return;
  const payload={};
  for(const field of defs[active].fields){
    const [key,,type,required]=field;
    const el=form.elements.namedItem(key);
    let val;
    if(type==="checkbox")val=el.checked;
    else if(type==="number")val=el.value===""?0:Number(el.value);
    else if(type==="relation")val=el.value===""?null:Number(el.value);
    else val=el.value.trim();
    if(val===""&&!required&&type==="date")val=null;
    payload[key]=val;
  }
  const button=$("saveEditor");button.disabled=true;
  try{
    const method=editId?"PATCH":"POST";
    const url=endpoint(active)+(editId?editId+"/":"");
    await request(url,{method,body:JSON.stringify(payload)});
    closeEditor();
    notify(editId?"Cambios guardados correctamente.":"Registro agregado correctamente.");
    await load(active);
  }catch(error){
    $("editorError").hidden=false;
    $("editorError").textContent=error.message;
  }finally{button.disabled=false;}
}
async function removeItem(row){
  if(!can("delete"))return;
  const name=friendlyName(row);
  if(!window.confirm("¿Eliminar «"+name+"»? Esta acción no se puede deshacer."))return;
  try{
    await request(endpoint(active)+row.id+"/",{method:"DELETE"});
    selectedId=null;
    notify("Registro eliminado correctamente.");
    await load(active);
  }catch(error){notify("No se pudo eliminar: "+error.message);}
}
function selectedItem(){
  const id=$("selectedRecord").value;
  if(!id){notify("Selecciona primero un registro en la lista.");return null;}
  const item=rows.find(row=>String(row.id)===id);
  if(!item)notify("Registro no encontrado. Actualiza la lista.");
  return item||null;
}
function setView(mode){
  viewMode=mode;
  $("listTableWrap").hidden=mode!=="table";
  $("cardsGrid").hidden=mode!=="cards";
  $("toggleTable").classList.toggle("active",mode==="table");
  $("toggleCards").classList.toggle("active",mode==="cards");
  $("toggleTable").setAttribute("aria-pressed",String(mode==="table"));
  $("toggleCards").setAttribute("aria-pressed",String(mode==="cards"));
}
document.querySelectorAll(".ap-module").forEach(button=>button.addEventListener("click",()=>load(button.dataset.resource)));
$("refreshBtn").addEventListener("click",()=>load(active));
$("actionGet").addEventListener("click",()=>load(active));
$("actionPost").addEventListener("click",()=>openEditor());
$("actionPatch").addEventListener("click",()=>{const row=selectedItem();if(row)openEditor(row);});
$("actionDelete").addEventListener("click",()=>{const row=selectedItem();if(row)removeItem(row);});
$("newBtn").addEventListener("click",()=>openEditor());
$("selectedRecord").addEventListener("change",(event)=>selectRow(event.target.value||null));
$("searchRecords").addEventListener("input",render);
$("statusFilter").addEventListener("change",render);
$("toggleTable").addEventListener("click",()=>setView("table"));
$("toggleCards").addEventListener("click",()=>setView("cards"));
$("copyJson").addEventListener("click",()=>{
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(raw).then(()=>notify("JSON copiado al portapapeles.")).catch(()=>notify("Selecciona el texto para copiarlo."));
  }else{notify("Selecciona el texto para copiarlo.");}
});
$("closeEditor").addEventListener("click",closeEditor);
$("cancelEditor").addEventListener("click",closeEditor);
$("editorBackdrop").addEventListener("click",closeEditor);
$("editorForm").addEventListener("submit",save);
document.addEventListener("keydown",(event)=>{if(event.key==="Escape")closeEditor();});
const params=new URLSearchParams(window.location.search);
const start=defs[params.get("modulo")]?params.get("modulo"):"herramientas";
setView("table");
load(start).then(()=>{if(params.get("nuevo")==="1"&&can("add"))openEditor();});
})();
