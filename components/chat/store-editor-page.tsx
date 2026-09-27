"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StyledSelect } from "./styled-select";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Eye, Gift, Pencil, Plus, Save, Search, Settings2, Trash2, X } from "lucide-react";
import type { StoreCategory } from "@/lib/chat-contract";
import { BackToChatButton } from "./back-to-chat-button";
import {
  createStoreCategory, createStoreProduct, deleteStoreCategory, deleteStoreCategoryImage, deleteStoreProduct,
  fetchStoreEditorCatalog, updateStoreCategory, updateStoreProduct, uploadStoreCategoryImage,
  type StoreCategoryInput, type StoreEditorCatalog, type StoreProduct, type StoreProductInput,
} from "@/lib/store-editor-api";
import { StoreCategoryIcon, storeIconOptions } from "./store-category-icon";

type Tab = "categories" | "products";
type EditorDialog = { kind: "category" | "product"; mode: "view" | "edit" | "create"; id?: string };
const PAGE_SIZE = 20;
const blankCategory: StoreCategoryInput = { name: "", description: "", icon: "gift", active: true, position: 0 };
const blankProduct = (categoryId: string): StoreProductInput => ({ categoryId, name: "", description: "", emoji: "🎁", kind: "gift", effectKey: null, imageKey: null, price: 5, active: true, position: 0 });

function HoldDeleteButton({ label, disabled, onDelete }: { label: string; disabled: boolean; onDelete: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }
  function start() {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onDelete();
    }, 2000);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <button type="button" className={"store-crud-action danger" + (holding ? " holding" : "")} disabled={disabled} aria-label={"Удалить " + label + ": удерживайте две секунды"} title="Удерживайте 2 секунды для удаления" onClick={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => { event.preventDefault(); start(); }} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onKeyDown={(event) => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); start(); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancel(); }}><Trash2 size={14} /><span>{holding ? "Держите…" : "Удалить"}</span></button>;
}

export function StoreEditorPage({ onBack, onBackToChat }: { onBack: () => void; onBackToChat: () => void }) {
  const [catalog, setCatalog] = useState<StoreEditorCatalog | null>(null);
  const [tab, setTab] = useState<Tab>("categories");
  const [dialog, setDialog] = useState<EditorDialog | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<StoreCategoryInput>(blankCategory);
  const [productDraft, setProductDraft] = useState<StoreProductInput>(blankProduct(""));
  const [query, setQuery] = useState("");
  const [productPage, setProductPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    const next = await fetchStoreEditorCatalog();
    setCatalog(next);
    return next;
  }
  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить магазин")); }, []);
  useEffect(() => { setProductPage(0); }, [query]);
  useEffect(() => {
    if (!dialog) return;
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && !busy) setDialog(null); }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [dialog, busy]);

  const categories = catalog?.categories ?? [];
  const products = catalog?.products ?? [];
  const selectedCategory = dialog?.kind === "category" ? categories.find((item) => item.id === dialog.id) ?? null : null;
  const selectedProduct = dialog?.kind === "product" ? products.find((item) => item.id === dialog.id) ?? null : null;
  const filteredProducts = useMemo(() => products.filter((item) =>
    (item.name + " " + item.description + " " + (categories.find((category) => category.id === item.categoryId)?.name ?? ""))
      .toLowerCase().includes(query.trim().toLowerCase())), [products, categories, query]);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const visibleProducts = filteredProducts.slice(productPage * PAGE_SIZE, (productPage + 1) * PAGE_SIZE);

  function openCategory(mode: EditorDialog["mode"], item?: StoreCategory) {
    setTab("categories"); setError(""); setNotice("");
    setCategoryDraft(item ? { name: item.name, description: item.description, icon: item.icon, active: item.active, position: item.position } : { ...blankCategory, position: (categories.length + 1) * 10 });
    setDialog({ kind: "category", mode, id: item?.id });
  }
  function openProduct(mode: EditorDialog["mode"], item?: StoreProduct) {
    setTab("products"); setError(""); setNotice("");
    setProductDraft(item ? { categoryId: item.categoryId, name: item.name, description: item.description, emoji: item.emoji, kind: item.kind, effectKey: item.effectKey, imageKey: item.imageKey, price: item.price, active: item.active, position: item.position } : blankProduct(categories.find((category) => category.active)?.id ?? ""));
    setDialog({ kind: "product", mode, id: item?.id });
  }
  function showError(cause: unknown) { setError(cause instanceof Error ? cause.message : "Не удалось изменить магазин"); }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dialog || dialog.kind !== "category" || busy) return;
    setBusy(true); setError("");
    try {
      const created = dialog.mode === "create";
      const saved = created ? await createStoreCategory(categoryDraft) : await updateStoreCategory(dialog.id ?? "", categoryDraft);
      await reload();
      if (created) { setDialog({ kind: "category", mode: "edit", id: saved.id }); setNotice("Категория создана. Теперь можно добавить изображение."); }
      else { setDialog(null); setNotice("Категория сохранена."); }
    } catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
    if (productDraft.kind === "cosmetic" && !productDraft.effectKey) { setError("Выберите эффект товара."); return; }
  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dialog || dialog.kind !== "product" || busy) return;
    setBusy(true); setError("");
    try {
      const created = dialog.mode === "create";
      if (created) await createStoreProduct(productDraft);
      else await updateStoreProduct(dialog.id ?? "", productDraft);
      await reload();
      setDialog(null); setNotice(created ? "Товар добавлен." : "Товар сохранён.");
    } catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function removeCategory(item: StoreCategory) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteStoreCategory(item.id); await reload(); if (dialog?.id === item.id) setDialog(null); setNotice("Категория удалена."); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function removeProduct(item: StoreProduct) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await deleteStoreProduct(item.id); await reload(); setProductPage(0); if (dialog?.id === item.id) setDialog(null); setNotice("Товар удалён; уже вручённые подарки сохранены."); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function uploadImage(file: File | undefined) {
    if (!selectedCategory || !file || busy) return;
    setBusy(true); setError("");
    try { await uploadStoreCategoryImage(selectedCategory.id, file); await reload(); setNotice("Изображение категории обновлено."); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function removeImage() {
    if (!selectedCategory || busy) return;
    setBusy(true); setError("");
    try { await deleteStoreCategoryImage(selectedCategory.id); await reload(); setNotice("Изображение категории удалено."); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  return <section className="store-editor-page">
    <header className="store-editor-head"><div className="page-heading"><span className="page-heading-icon"><Settings2 size={19} /></span><div className="page-heading-copy"><span className="eyebrow">УПРАВЛЕНИЕ КАТАЛОГОМ</span><h2>Редактор магазина</h2></div></div><div className="store-editor-actions"><button type="button" className="action-button secondary" onClick={onBack}><ArrowLeft size={15} />К магазину</button><BackToChatButton onClick={onBackToChat} /></div></header>
    <nav className="store-editor-tabs" aria-label="Разделы редактора"><button type="button" className={"store-editor-tab" + (tab === "categories" ? " active" : "")} onClick={() => { setTab("categories"); setDialog(null); setError(""); }}><Settings2 size={15} />Категории <b>{categories.length}</b></button><button type="button" className={"store-editor-tab" + (tab === "products" ? " active" : "")} onClick={() => { setTab("products"); setDialog(null); setError(""); }}><Gift size={15} />Товары <b>{products.length}</b></button></nav>
    <div className="store-editor-scroll">
      <div className="store-crud-toolbar"><div><h3>{tab === "categories" ? "Категории" : "Товары"}</h3><p>{tab === "categories" ? "Управляйте разделами витрины и их изображениями." : "Все товары каталога с ценами и статусами."}</p></div><button type="button" className="action-button" disabled={!catalog || busy || (tab === "products" && categories.length === 0)} onClick={() => tab === "categories" ? openCategory("create") : openProduct("create")}><Plus size={16} />{tab === "categories" ? "Новая категория" : "Новый товар"}</button></div>
      {!dialog && error && <p className="auth-error" role="alert">{error}</p>}
      {!dialog && notice && <p className="store-editor-notice" role="status">{notice}</p>}
      {tab === "products" && <label className="store-crud-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по товарам и категориям" /></label>}
      <div className="store-crud-table-wrap">
        {!catalog ? <p className="store-editor-empty">Загружаем каталог…</p> : tab === "categories" ? <table className="store-crud-table"><thead><tr><th>Категория</th><th>Товаров</th><th>Порядок</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><span className="store-crud-title"><span className="store-crud-icon"><StoreCategoryIcon category={item} size={23} /></span><span><strong>{item.name}</strong><small>{item.description || "Без описания"}</small></span></span></td><td>{products.filter((product) => product.categoryId === item.id).length}</td><td>{item.position}</td><td><span className={"store-crud-status" + (item.active ? " active" : "")}>{item.active ? "На витрине" : "Скрыта"}</span></td><td><div className="store-crud-actions"><button type="button" className="store-crud-action" title="Просмотр" onClick={() => openCategory("view", item)}><Eye size={14} />Просмотр</button><button type="button" className="store-crud-action" title="Редактировать" onClick={() => openCategory("edit", item)}><Pencil size={14} />Изменить</button><HoldDeleteButton label={"категорию " + item.name} disabled={busy} onDelete={() => void removeCategory(item)} /></div></td></tr>)}</tbody></table> : <table className="store-crud-table"><thead><tr><th>Товар</th><th>Категория</th><th>Цена</th><th>Порядок</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{visibleProducts.map((item) => <tr key={item.id}><td><span className="store-crud-title"><span className="store-crud-icon store-crud-emoji">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.emoji}</span><span><strong>{item.name}</strong><small>{item.description || "Без описания"}</small></span></span></td><td>{categories.find((category) => category.id === item.categoryId)?.name ?? "—"}</td><td><strong>{item.price.toLocaleString("ru-RU")}</strong> <small>кр.</small></td><td>{item.position}</td><td><span className={"store-crud-status" + (item.active ? " active" : "")}>{item.active ? "На витрине" : "Скрыт"}</span></td><td><div className="store-crud-actions"><button type="button" className="store-crud-action" title="Просмотр" onClick={() => openProduct("view", item)}><Eye size={14} />Просмотр</button><button type="button" className="store-crud-action" title="Редактировать" onClick={() => openProduct("edit", item)}><Pencil size={14} />Изменить</button><HoldDeleteButton label={"товар " + item.name} disabled={busy} onDelete={() => void removeProduct(item)} /></div></td></tr>)}</tbody></table>}
        {catalog && (tab === "categories" ? categories.length === 0 : filteredProducts.length === 0) && <p className="store-editor-empty">{tab === "categories" ? "Категорий пока нет. Создайте первую." : "Товары не найдены."}</p>}
      </div>
      {tab === "products" && filteredProducts.length > PAGE_SIZE && <footer className="store-crud-pagination"><span>{filteredProducts.length} товаров · страница {productPage + 1} из {pageCount}</span><div><button type="button" disabled={productPage === 0} onClick={() => setProductPage((page) => page - 1)}><ChevronLeft size={16} /></button><button type="button" disabled={productPage >= pageCount - 1} onClick={() => setProductPage((page) => page + 1)}><ChevronRight size={16} /></button></div></footer>}
    </div>
    {dialog && <div className="store-crud-backdrop" onMouseDown={() => !busy && setDialog(null)}><section className="store-crud-dialog" role="dialog" aria-modal="true" aria-label={dialog.mode === "view" ? "Просмотр" : dialog.mode === "create" ? "Создание" : "Редактирование"} onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{dialog.kind === "category" ? "КАТЕГОРИЯ" : "ТОВАР"} · {dialog.mode === "view" ? "ПРОСМОТР" : dialog.mode === "create" ? "СОЗДАНИЕ" : "РЕДАКТИРОВАНИЕ"}</span><h3>{dialog.kind === "category" ? selectedCategory?.name ?? "Новая категория" : selectedProduct?.name ?? "Новый товар"}</h3></div><button type="button" aria-label="Закрыть" title="Закрыть" onClick={() => !busy && setDialog(null)}><X size={19} /></button></header>
      <div className="store-crud-dialog-body">
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="store-editor-notice" role="status">{notice}</p>}
        {dialog.mode === "view" ? dialog.kind === "category" && selectedCategory ? <div className="store-crud-view"><div className="store-crud-view-hero"><span className="store-editor-image-preview">{selectedCategory.imageUrl ? <img src={selectedCategory.imageUrl} alt="" /> : <StoreCategoryIcon category={selectedCategory} size={29} />}</span><div><strong>{selectedCategory.name}</strong><small>{selectedCategory.description || "Без описания"}</small></div></div><dl><dt>Значок</dt><dd>{storeIconOptions.find(([key]) => key === selectedCategory.icon)?.[1] ?? selectedCategory.icon}</dd><dt>Товаров</dt><dd>{products.filter((product) => product.categoryId === selectedCategory.id).length}</dd><dt>Порядок</dt><dd>{selectedCategory.position}</dd><dt>Статус</dt><dd>{selectedCategory.active ? "На витрине" : "Скрыта"}</dd><dt>Создана</dt><dd>{new Date(selectedCategory.createdAt).toLocaleString("ru-RU")}</dd><dt>ID</dt><dd>{selectedCategory.id}</dd></dl><footer><button type="button" className="action-button" onClick={() => openCategory("edit", selectedCategory)}><Pencil size={15} />Редактировать</button></footer></div> : selectedProduct ? <div className="store-crud-view"><div className="store-crud-view-hero"><span className="store-editor-image-preview store-crud-emoji">{selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt="" /> : selectedProduct.emoji}</span><div><strong>{selectedProduct.name}</strong><small>{selectedProduct.description || "Без описания"}</small></div></div><dl><dt>Категория</dt><dd>{categories.find((item) => item.id === selectedProduct.categoryId)?.name ?? "—"}</dd><dt>Тип</dt><dd>{selectedProduct.kind === "cosmetic" ? "Улучшение профиля" : "Подарок"}</dd><dt>Эффект</dt><dd>{selectedProduct.effectKey ?? "—"}</dd><dt>Картинка</dt><dd>{selectedProduct.imageKey ?? "Квадратная заглушка"}</dd><dt>Цена</dt><dd>{selectedProduct.price.toLocaleString("ru-RU")} кредитов</dd><dt>Порядок</dt><dd>{selectedProduct.position}</dd><dt>Статус</dt><dd>{selectedProduct.active ? "На витрине" : "Скрыт"}</dd><dt>Создан</dt><dd>{new Date(selectedProduct.createdAt).toLocaleString("ru-RU")}</dd><dt>ID</dt><dd>{selectedProduct.id}</dd></dl><footer><button type="button" className="action-button" onClick={() => openProduct("edit", selectedProduct)}><Pencil size={15} />Редактировать</button></footer></div> : null
        : dialog.kind === "category" ? <form className="store-editor-form" onSubmit={(event) => void saveCategory(event)}><div className="store-editor-fields"><label>Название<input autoFocus required minLength={1} maxLength={80} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label><label>Значок<StyledSelect value={categoryDraft.icon} onChange={(event) => setCategoryDraft({ ...categoryDraft, icon: event.target.value })}>{storeIconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</StyledSelect></label><label className="wide">Описание<textarea maxLength={240} rows={3} value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} /></label><label>Порядок показа<input type="number" min={0} max={2147483647} value={categoryDraft.position} onChange={(event) => setCategoryDraft({ ...categoryDraft, position: Number(event.target.value) })} /></label><label className="store-editor-check"><input type="checkbox" checked={categoryDraft.active} onChange={(event) => setCategoryDraft({ ...categoryDraft, active: event.target.checked })} />Показывать на витрине</label></div><div className="store-editor-image"><div className="store-editor-image-preview">{selectedCategory?.imageUrl ? <img src={selectedCategory.imageUrl} alt={selectedCategory.name} /> : <StoreCategoryIcon category={{ name: categoryDraft.name, icon: categoryDraft.icon, imageUrl: null }} size={28} />}</div><div><strong>Изображение категории</strong><small>PNG, JPEG или WebP, до 5 МБ. На витрине заменяет значок.</small></div>{selectedCategory && <><label className="action-button secondary"><Camera size={14} />Загрузить<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => void uploadImage(event.target.files?.[0])} /></label>{selectedCategory.imageUrl && <HoldDeleteButton label="изображение категории" disabled={busy} onDelete={() => void removeImage()} />}</>}</div>{!selectedCategory && <p className="store-editor-help">Изображение можно загрузить после создания категории.</p>}{selectedCategory && <small className="store-editor-id">ID: {selectedCategory.id}</small>}<footer><button type="button" className="action-button secondary" onClick={() => setDialog(null)}>Отмена</button><button type="submit" className="action-button" disabled={busy || !categoryDraft.name.trim()}><Save size={15} />{busy ? "Сохраняем…" : selectedCategory ? "Сохранить" : "Создать категорию"}</button></footer></form>
        : <form className="store-editor-form" onSubmit={(event) => void saveProduct(event)}><div className="store-editor-fields"><label>Категория<StyledSelect required value={productDraft.categoryId} onChange={(event) => setProductDraft({ ...productDraft, categoryId: event.target.value })}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</StyledSelect></label><label>Порядок показа<input type="number" min={0} max={2147483647} value={productDraft.position} onChange={(event) => setProductDraft({ ...productDraft, position: Number(event.target.value) })} /></label><label>Название<input autoFocus required maxLength={80} value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} /></label><label>Символ товара<input required maxLength={16} value={productDraft.emoji} onChange={(event) => setProductDraft({ ...productDraft, emoji: event.target.value })} /></label><label>Тип товара<StyledSelect value={productDraft.kind} onChange={(event) => setProductDraft({ ...productDraft, kind: event.target.value as StoreProductInput["kind"], effectKey: event.target.value === "gift" ? null : productDraft.effectKey })}><option value="gift">Подарок</option><option value="cosmetic">Улучшение профиля</option></StyledSelect></label>{productDraft.kind === "cosmetic" && <label>Эффект<StyledSelect required value={productDraft.effectKey ?? ""} onChange={(event) => setProductDraft({ ...productDraft, effectKey: event.target.value })}><option value="">Выберите эффект</option>{["boldText","italicText","colorNick","gradientNick","gradientText","pictureNick","avatarFrame","profileCover","customStatus","vip"].map((key) => <option key={key} value={key}>{key}</option>)}</StyledSelect></label>}<label className="wide">Путь к квадратной картинке<input maxLength={255} value={productDraft.imageKey ?? ""} onChange={(event) => setProductDraft({ ...productDraft, imageKey: event.target.value || null })} placeholder="Оставьте пустым для заглушки" /></label><label className="wide">Описание<textarea maxLength={240} rows={3} value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} /></label><label>Цена в кредитах<input type="number" required min={1} max={2147483647} value={productDraft.price} onChange={(event) => setProductDraft({ ...productDraft, price: Number(event.target.value) })} /></label><label className="store-editor-check"><input type="checkbox" checked={productDraft.active} onChange={(event) => setProductDraft({ ...productDraft, active: event.target.checked })} />Показывать на витрине</label></div><p className="store-editor-help">Подарок вручается участнику. Улучшение профиля покупается только себе и настраивается после покупки. Без картинки выводится квадратная заглушка 250×250.</p>{selectedProduct && <small className="store-editor-id">ID: {selectedProduct.id}. Он неизменен из-за истории покупок.</small>}<footer><button type="button" className="action-button secondary" onClick={() => setDialog(null)}>Отмена</button><button type="submit" className="action-button" disabled={busy || !productDraft.categoryId || !productDraft.name.trim()}><Save size={15} />{busy ? "Сохраняем…" : selectedProduct ? "Сохранить" : "Добавить товар"}</button></footer></form>}
      </div></section></div>}
  </section>;
}
