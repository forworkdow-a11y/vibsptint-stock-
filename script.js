dialog").close();render();showNotice(productId?"Product updated.":"Product added.");
});
let editingVariantId=null;
const openProductOriginal=openProduct;
openProduct=function(product=null,variant=null){editingVariantId=variant?.id||null;openProductOriginal(product,variant);};
$("movement-form").addEventListener("submit",e=>{
e.preventDefault();const found=findVariant($("movement-variant-id").value);if(!found)return;
try{recordMovement({...found.variant,productId:found.product.id,productName:found.product.name,current:current(found.variant)},$("movement-type").value,$("movement-quantity").value,$("movement-note").value.trim());$("movement-dialog").close();showNotice("Stock movement recorded.");}
catch(err){$("movement-error").textContent=err.message||"Could not record movement.";$("movement-error").classList.remove("hidden");}
});
$("stocktake-form").addEventListener("submit",e=>{
e.preventDefault();const found=findVariant($("stocktake-variant-id").value);if(!found)return;const actual=Number($("stocktake-quantity").value);
if(!Number.isInteger(actual)||actual<0){$("stocktake-error").textContent="Count must be a whole number of zero or more.";$("stocktake-error").classList.remove("hidden");return;}
const v=found.variant,previous=current(v),delta=actual-previous;
v.startingStock=Number(v.startingStock||0)+delta;v.lastStockTake=today();
state.movements.push({id:makeId(),productId:found.product.id,productName:found.product.name,variantId:v.id,size:v.size,colour:v.colour,type:"take",quantity:actual,date:today(),note:$("stocktake-note").value.trim()||Physical count (difference ${delta>=0?"+":""}${delta}),createdAt:new Date().toISOString()});
save();$("stocktake-dialog").close();render();showNotice("Physical stock count saved.");
});
$("confirm-delete").addEventListener("click",()=>{if(!deleteProductId)return;const p=state.products.find(p=>p.id===deleteProductId);state.products=state.products.filter(p=>p.id!==deleteProductId);state.movements=state.movements.filter(m=>m.productId!==deleteProductId);deleteProductId=null;save();$("confirm-dialog").close();render();showNotice(Deleted ${p?.name||"product"}.);});
$("export-csv").addEventListener("click",exportCsv);
$("export-backup").addEventListener("click",()=>download(stockwise-backup-${today()}.json,JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),"application/json"));
$("import-backup").addEventListener("change",async e => {
const file = e.target.files?.[0]; if (!file) return;
try {
const parsed = JSON.parse(await file.text());
if (!Array.isArray(parsed.products) || !Array.isArray(parsed.movements)) throw new Error("This file is not a StockWise backup.");
if (!confirm("Importing replaces the inventory saved in this browser. Continue?")) return;
state = { products: parsed.products, movements: parsed.movements }; save(); render(); showNotice("Inventory backup imported.");
}
catch (err) { showNotice(err.message || "Could not import backup.", true); } finally { e.target.value = ""; }
});
$("clear-search").addEventListener("click",()=>{$("search").value="";searchText="";renderHistory();});
load();
})();
