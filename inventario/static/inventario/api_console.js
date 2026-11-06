(() => {
"use strict";
const root = document.getElementById("apiApp");
if (!root) return;
const staff = root.dataset.staff === "true";
const permissionMap = JSON.parse(root.dataset.permissions || "{}");
const can = (action) => Boolean(permissionMap[active]?.[action]);
const defs = {
 herramientas: {title:"Herramientas",description:"Inventario de activos, disponibilidad y mantenimiento.",fields:[
 ["codigo","Código","text",true],["nombre","Nombre","text",true],["estado","Estado","select",true,["disponible","en_uso","mantenimiento","baja"]],["horas_uso","Horas de uso","number",true],["fecha_proximo_mantenimiento","Próximo mantenimiento","date",false]],
 columns:[["codigo","CÓDIGO"],["nombre","HERRAMIENTA"],["estado","ESTADO"],["horas_uso","HORAS DE USO"],["fecha_proximo_mantenimiento","PRÓX. REVISIÓN"]]},
 prestamos:{title:"Préstamos",description:"Entrega, devolución y seguimiento de responsables.",fields:[
 ["herramienta","Herramienta","relation",true,"herramientas"],["contratista","Contratista","relation",true,"contratistas"],["fecha_entrega","Fecha de entrega","date",true],["fecha_limite","Fecha límite","date",true],["fecha_devolucion","Fecha devolución","date",false],["firma_responsable","Constancia de recepción","text",true]],
 columns:[["id","ID"],["herramienta_nombre","HERRAMIENTA"],["contratista_nombre","RESPONSABLE"],["fecha_limite","FECHA LÍMITE"],["atrasado","ATRASADO"],["fecha_devolucion","DEVOLUCIÓN"]]},
 contratistas:{title:"Contratistas",description:"Responsables, autorizaciones y bloqueos por atraso.",fields:[
 ["nombre","Nombre","text",true],["rut","RUT","text",true],["suspendido","Suspendido","checkbox",false]],
 columns:[["nombre","NOMBRE"],["rut","RUT"],["moroso","MOROSIDAD"],["suspendido","SUSPENDIDO"]]},
 mantenimientos:{title:"Mantenimientos",description:"Programa inspecciones y revisa vencimientos.",fields:[
 ["herramienta","Herramienta","relation",true,"herramientas"],["tipo","Tipo","select",true,["preventivo","correctivo"]],["fecha_programada","Fecha programada","date",true],["fecha_realizada","Fecha realizada","date",false],["descripcion","Descripción","textarea",false]],
 columns:[["id","ID"],["herramienta","HERRAMIENTA"],["tipo","TIPO"],["fecha_programada","PROGRAMADO"],["fecha_realizada","REALIZADO"],["vencido","VENCIDO"]]}
};
const $ = id => document.getElementById(id);
let active="herramientas", rows=[], raw="[]", editId=null, toastHandle=null, selectedId=null;
const node=(tag,className,txt)=>{const el=document.createElement(tag);if(className)el.className=className;if(txt!==undefined)el.textContent=String(txt);return el;};
const url=k=>"/api/"+k+"/";
const getCookie=name=>document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="))?.slice(name.length+1)||"";
function notify(message){$("toast").textContent=message;$("toast").hidden=false;clearTimeout(toastHandle);toastHandle=setTimeout(()=>$("toast").hidden=true,4000);}
function errors(data){if(typeof data==="string")return data;return Object.entries(data||{}).map(([k,v])=>k+": "+(Array.isArray(v)?v.join(", "):String(v))).join("\n");}
async function request(path,opt={}){
const headers={"Accept":"application/json",...opt.headers};
if(opt.method && opt.method!=="GET"){headers["X-CSRFToken"]=decodeURIComponent(getCookie("csrftoken"));headers["Content-Type"]="application/json";}
const res=await fetch(path,{credentials:"same-origin",...opt,headers});
const data=await res.json().catch(()=>({detail:"El servidor no devolvió JSON."}));
if(!res.ok)throw Error(errors(data)||"Error HTTP "+res.status);
return data;
}
const friendly=(name,value)=>{
if(value===null||value===undefined||value==="")return "—";
if(typeof value==="boolean")return value?"Sí":"No";
if(name.includes("fecha")&&typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split("-");return d+"/"+m+"/"+y;}
return String(value);
};
const flag=(name,v)=>{
if(name==="atrasado"||name==="moroso"||name==="vencido"||name==="suspendido"||name==="estado"){
const p=node("span","ap-flag");
const bad=(typeof v==="boolean"&&v)||(name==="estado"&&["baja","mantenimiento"].includes(v));
if(bad)p.classList.add("danger");
else if(name==="estado"&&v==="en_uso")p.classList.add("warn");
else if(v===false||v==="disponible")p.classList.add("neutral");
p.textContent=name==="estado"?friendly(name,v).replaceAll("_"," "):friendly(name,v);
return p;}return document.createTextNode(friendly(name,v));
};
function refreshActions(){
  const select = $("selectedRecord");
  const previous = selectedId === null ? "" : String(selectedId);
  select.replaceChildren(new Option("Selecciona un registro...", ""));
  for (const item of rows){
    const description = item.codigo ? item.codigo+" — "+item.nombre :
      item.nombre ? item.nombre :
      item.herramienta_nombre ? item.herramienta_nombre+" · "+(item.contratista_nombre || item.tipo || item.id) :
      item.id+" · "+(item.tipo || item.herramienta || "Registro");
    select.add(new Option(description, String(item.id)));
  }
  if (previous && rows.some(item => String(item.id) === previous)){
    select.value = previous;
  } else {
    selectedId = null;
    select.value = "";
  }
  $("actionPost").disabled = !can("add");
  $("actionPatch").disabled = !can("change");
  $("actionDelete").disabled = !can("delete");
  $("actionPost").title = can("add") ? "Crear registro" : "Tu usuario no tiene permiso para crear";
  $("actionPatch").title = can("change") ? "Editar registro seleccionado" : "Tu usuario no tiene permiso para editar";
  $("actionDelete").title = can("delete") ? "Eliminar registro seleccionado" : "Tu usuario no tiene permiso para eliminar";
  const anyWrite = can("add") || can("change") || can("delete");
  $("roleHelp").textContent = anyWrite ?
    "Permisos de tu cuenta: "+[can("add")?"crear":null,can("change")?"editar":null,can("delete")?"eliminar":null].filter(Boolean).join(", ")+"."
    : "Modo solo lectura: inicia sesión con un administrador u operador autorizado para modificar.";
}
function selectedItem(){
  const id = $("selectedRecord").value;
  if (!id){notify("Selecciona primero un registro en la lista desplegable.");return null;}
  const item = rows.find(row => String(row.id) === id);
  if (!item)notify("Registro no encontrado. Actualiza la lista.");
  return item || null;
}
function render(){
const q=$("searchRecords").value.toLocaleLowerCase("es").trim();
const found=rows.filter(x=>Object.values(x).some(v=>String(v??"").toLocaleLowerCase("es").includes(q)));
const head=$("tableHead");head.replaceChildren();const htr=node("tr");
for(const [,label] of defs[active].columns)htr.append(node("th","",label));
if(staff && (can("change") || can("delete")))htr.append(node("th","","GESTIÓN"));head.append(htr);
const body=$("tableBody");body.replaceChildren();
if(!found.length){const tr=node("tr"),td=node("td","ap-empty",q?"No se encontraron coincidencias.":"No hay registros en este módulo.");td.colSpan=defs[active].columns.length+(staff && (can("change") || can("delete"))?1:0);tr.append(td);body.append(tr);}
for(const item of found){
const tr=node("tr");
for(const [key] of defs[active].columns){const td=node("td");td.append(flag(key,item[key]));tr.append(td);}
if(staff && (can("change") || can("delete"))){const td=node("td"),act=node("div","ap-row-actions");
if(can("change")){const btn=node("button","ap-small-btn","Editar");btn.type="button";btn.addEventListener("click",()=>openEditor(item));act.append(btn);}
if(can("delete")){const del=node("button","ap-small-btn danger","Eliminar");del.type="button";del.addEventListener("click",()=>removeItem(item));act.append(del);}
td.append(act);tr.append(td);}body.append(tr);}
$("totalCount").textContent=rows.length;$("tableFooter").textContent=found.length+" de "+rows.length+" registros";refreshActions();
}
async function load(k){
if(!defs[k])k="herramientas";
if(active!==k)selectedId=null;active=k;$("newBtn").hidden=!can("add");$("moduleTitle").textContent=defs[k].title;$("breadcrumb").textContent=k.toUpperCase();$("moduleDescription").textContent=defs[k].description;
$("apiEndpoint").textContent="GET "+url(k);$("openEndpoint").href=url(k);$("requestStatus").textContent="Consultando";
document.querySelectorAll(".ap-module").forEach(b=>b.classList.toggle("active",b.dataset.resource===k));
const params=new URLSearchParams(location.search);params.set("modulo",k);params.delete("nuevo");history.replaceState(null,"","/api/?"+params);
$("tableBody").replaceChildren(node("tr"));$("searchRecords").value="";
try {const data=await request(url(k));rows=Array.isArray(data)?data:Array.isArray(data.results)?data.results:[];raw=JSON.stringify(data,null,2);$("apiResponse").textContent=raw;
$("requestStatus").textContent="Operativa";$("updatedAt").textContent="Actualizada "+new Date().toLocaleTimeString("es-CL");render();}
catch(e){rows=[];raw=JSON.stringify({error:e.message},null,2);$("apiResponse").textContent=raw;$("requestStatus").textContent="Error";$("tableBody").replaceChildren();render();notify(e.message);}
}
function makeField(field,value,choices){
const [key,label,type,required]=field;
const wrap=node("div","ap-field"),lab=node("label","",label);lab.htmlFor="field_"+key;wrap.append(lab);let input;
if(type==="select"||type==="relation"){input=node("select");const opts=type==="select"?(field[4]||[]).map(v=>({value:v,text:v.replaceAll("_"," ")})):choices;
if(!required)input.append(new Option("Sin asignar",""));
for(const o of opts){const option=new Option(o.text,o.value);input.add(option);} }
else if(type==="textarea") input=node("textarea");
else {input=node("input");input.type=type;if(type==="number")input.min=0;if(type==="checkbox")input.checked=Boolean(value);}
input.name=key;input.id="field_"+key;if(required&&type!=="checkbox")input.required=true;
if(value!==undefined&&value!==null&&type!=="checkbox")input.value=String(value);
if(type==="date"&&!value&&!required)input.value="";
wrap.append(input);return wrap;
}
async function openEditor(item=null){
if(!staff || !can(item ? "change" : "add"))return;
editId=item?.id||null;$("editorError").hidden=true;$("editorError").textContent="";
$("editorTitle").textContent=editId?"Editar "+defs[active].title.toLowerCase():"Nuevo registro";
const fields=$("editorFields");fields.replaceChildren();
for(const field of defs[active].fields){
let choices=[];
if(field[2]==="relation"){
try{const data=await request(url(field[4]));const options=Array.isArray(data)?data:data.results||[];choices=options.map(x=>({value:x.id,text:x.codigo?x.codigo+" — "+x.nombre:x.nombre}));}
catch(e){notify("No se pudo cargar "+field[4]+": "+e.message);return;}
}
fields.append(makeField(field,item?.[field[0]],choices));}
$("editorWrap").hidden=false;
const first=fields.querySelector("input,select,textarea");first?.focus();
}
function closeEditor(){$("editorWrap").hidden=true;}
async function save(ev){
ev.preventDefault();
const form=$("editorForm");if(!form.reportValidity())return;
const data={};
for(const field of defs[active].fields){
const [key,,type,required]=field,input=form.elements.namedItem(key);let value;
if(type==="checkbox")value=input.checked;
else if(type==="number")value=input.value===""?0:Number(input.value);
else if(type==="relation")value=input.value===""?null:Number(input.value);
else value=input.value.trim();
if(value===""&&!required)value=null;
data[key]=value;
}
const btn=$("saveEditor");btn.disabled=true;
try{await request(url(active)+(editId?editId+"/":""),{method:editId?"PATCH":"POST",body:JSON.stringify(data)});closeEditor();notify("Registro guardado.");await load(active);}
catch(e){$("editorError").hidden=false;$("editorError").textContent=e.message;}finally{btn.disabled=false;}
}
async function removeItem(item){
if(!can("delete")||!confirm("¿Eliminar este registro? No se puede recuperar."))return;
try{await request(url(active)+item.id+"/",{method:"DELETE"});notify("Registro eliminado.");await load(active);}
catch(e){notify("No se pudo eliminar: "+e.message);}
}
document.querySelectorAll(".ap-module").forEach(b=>b.addEventListener("click",()=>load(b.dataset.resource)));
$("refreshBtn").addEventListener("click",()=>load(active));
$("actionGet").addEventListener("click",()=>load(active));
$("actionPost").addEventListener("click",()=>openEditor());
$("actionPatch").addEventListener("click",()=>{const item=selectedItem();if(item)openEditor(item);});
$("actionDelete").addEventListener("click",()=>{const item=selectedItem();if(item)removeItem(item);});
$("selectedRecord").addEventListener("change",ev=>{selectedId=ev.target.value||null;});

$("newBtn").addEventListener("click",()=>openEditor());
$("searchRecords").addEventListener("input",render);
$("copyJson").addEventListener("click",()=>{navigator.clipboard?.writeText(raw).then(()=>notify("JSON copiado")).catch(()=>notify("Copia el JSON manualmente"));});
$("closeEditor").addEventListener("click",closeEditor);
$("cancelEditor").addEventListener("click",closeEditor);
$("editorBackdrop").addEventListener("click",closeEditor);
$("editorForm").addEventListener("submit",save);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEditor();});
const params=new URLSearchParams(location.search);const start=defs[params.get("modulo")]?params.get("modulo"):"herramientas";
load(start).then(()=>{if(can("add")&&params.get("nuevo")==="1")openEditor();});
})();