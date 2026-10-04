"use client";

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Search, X, Sparkles } from "lucide-react";
import { useFirestore, useCollection, useMemoFirebase, useUser } from "@/firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  doc,
  deleteField,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { useToast } from '@/hooks/use-toast';
import { prendaPromoKey, type PromoEspecial } from '@/lib/ofertas';

// --- Tipos ---
// Una promoción especial se guarda en la colección `gruposOferta` con tipo "especial"
// (así usa las mismas reglas de seguridad que los Grupos de Oferta). Además, cada
// prenda que participa recibe una copia en `promosEspeciales.<id>`, para que Ventas
// y Apartados conozcan la promoción sin leer esta colección.
type PrendaEnPromo = {
  pacaId: string;
  prendaId: string;
  idPersonalizado: string;
  tipoPrenda: string;
  genero?: string;
  talla?: string;
  precio: number; // precio suelto al momento de agregarla (solo de referencia)
};

type Componente = {
  nombre: string;
  cantidad: number | '';
  precioUnitario: number | ''; // precio de cada pieza de esta parte dentro de la promo
  prendas: PrendaEnPromo[];
};

type PromoDoc = {
  id: string;
  tipo: 'especial';
  nombre: string;
  precio: number;
  componentes: { nombre: string; cantidad: number; precioUnitario?: number; prendas: PrendaEnPromo[] }[];
};

type PrendaBuscable = PrendaEnPromo & { cantidad: number };

function normalizeText(text: string): string {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const nuevoComponente = (): Componente => ({ nombre: '', cantidad: 1, precioUnitario: '', prendas: [] });

/** Precio del paquete = suma de (cantidad x precio por pieza) de cada parte. */
const precioPaquete = (componentes: { cantidad: number | ''; precioUnitario?: number | '' }[]) =>
  componentes.reduce((sum, c) => sum + (Number(c.cantidad) || 0) * (Number(c.precioUnitario) || 0), 0);

const formatMoney = (n: number) => `$${n.toFixed(2)}`;

/** Rango de lo que costarían las prendas sueltas (la más barata y la más cara posibles). */
function rangoSuelto(componentes: { cantidad: number | ''; prendas: PrendaEnPromo[] }[]) {
  let min = 0;
  let max = 0;
  for (const c of componentes) {
    const cant = Number(c.cantidad) || 0;
    if (c.prendas.length === 0 || cant <= 0) return null;
    const precios = c.prendas.map(p => p.precio);
    min += cant * Math.min(...precios);
    max += cant * Math.max(...precios);
  }
  return { min, max };
}

/** Nombre de una parte del paquete: el tipo de la primera prenda agregada (ej. "Pantalón quirúrgico"). */
const nombreParte = (c: { nombre?: string; prendas?: { tipoPrenda: string }[] }) =>
  c.prendas?.[0]?.tipoPrenda || c.nombre?.trim() || 'prenda';

const describirPaquete = (componentes: { nombre?: string; cantidad: number | ''; precioUnitario?: number | ''; prendas?: { tipoPrenda: string }[] }[]) =>
  componentes.map(c => {
    const pu = Number(c.precioUnitario);
    return `${c.cantidad} ${nombreParte(c)}${pu > 0 ? ` ($${pu} c/u)` : ''}`;
  }).join(' + ');

export function PromosEspecialesSection() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const promosQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'gruposOferta'), where('tipo', '==', 'especial'));
  }, [firestore, user]);
  const { data: promos, isLoading } = useCollection<Omit<PromoDoc, 'id'>>(promosQuery);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoDoc | null>(null);
  const [nombre, setNombre] = useState('');
  const [componentes, setComponentes] = useState<Componente[]>([nuevoComponente()]);
  const [isSaving, setIsSaving] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<PromoDoc | null>(null);

  // Búsqueda de prendas (por ID o nombre) para el componente activo
  const [activeComp, setActiveComp] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [allPrendas, setAllPrendas] = useState<PrendaBuscable[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<PrendaBuscable[] | null>(null);

  const resetForm = () => {
    setEditing(null);
    setNombre('');
    setComponentes([nuevoComponente()]);
    setActiveComp(null);
    setSearchText('');
    setResults(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (promo: PromoDoc) => {
    setEditing(promo);
    setNombre(promo.nombre);
    // Promociones creadas antes de existir el precio por pieza lo traen vacío: hay que llenarlo.
    setComponentes((promo.componentes || []).map(c => ({ ...c, precioUnitario: c.precioUnitario ?? '', prendas: [...(c.prendas || [])] })));
    setActiveComp(null);
    setSearchText('');
    setResults(null);
    setIsDialogOpen(true);
  };

  const updateComponente = (idx: number, patch: Partial<Componente>) => {
    setComponentes(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeComponente = (idx: number) => {
    setComponentes(prev => prev.filter((_, i) => i !== idx));
    setActiveComp(null);
    setResults(null);
  };

  const addPrendasToComponente = (idx: number, prendas: PrendaEnPromo[]) => {
    setComponentes(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const existentes = new Set(c.prendas.map(p => prendaPromoKey(p.pacaId, p.prendaId)));
      const nuevas = prendas.filter(p => !existentes.has(prendaPromoKey(p.pacaId, p.prendaId)));
      return { ...c, prendas: [...c.prendas, ...nuevas] };
    }));
  };

  const removePrenda = (idx: number, p: PrendaEnPromo) => {
    setComponentes(prev => prev.map((c, i) =>
      i === idx ? { ...c, prendas: c.prendas.filter(x => !(x.pacaId === p.pacaId && x.prendaId === p.prendaId)) } : c
    ));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || activeComp === null || !searchText.trim()) return;
    setIsSearching(true);
    try {
      let prendas = allPrendas;
      if (!prendas) {
        const snapshot = await getDocs(collectionGroup(firestore, 'prendas'));
        prendas = snapshot.docs.map(d => {
          const data = d.data();
          return {
            pacaId: d.ref.parent.parent!.id,
            prendaId: d.id,
            idPersonalizado: data.idPersonalizado,
            tipoPrenda: data.tipoPrenda,
            genero: data.genero,
            talla: data.talla,
            precio: Number(data.precioIndividual || data.precioVenta) || 0,
            cantidad: Number(data.cantidad) || 0,
          };
        });
        setAllPrendas(prendas);
      }
      const texto = searchText.trim();
      const exacta = prendas.filter(p => (p.idPersonalizado || '').toUpperCase() === texto.toUpperCase());
      const words = normalizeText(texto).split(/\s+/).filter(Boolean);
      const encontradas = exacta.length > 0 ? exacta : prendas.filter(p => {
        const haystack = normalizeText(`${p.tipoPrenda} ${p.genero || ''} talla ${p.talla || ''} ${p.idPersonalizado}`);
        return words.every(w => haystack.includes(w));
      });
      setResults(encontradas.slice(0, 40));
      if (encontradas.length === 0) {
        toast({ variant: 'destructive', title: 'Sin resultados', description: `No se encontró ninguna prenda con "${texto}".` });
      }
    } catch (error) {
      console.error('Error searching prendas:', error);
      toast({ variant: 'destructive', title: 'Error de búsqueda' });
    } finally {
      setIsSearching(false);
    }
  };

  const numPrecio = precioPaquete(componentes);
  const rango = useMemo(() => rangoSuelto(componentes), [componentes]);

  const handleSave = async () => {
    if (!firestore) return;
    const comps = componentes.map(c => ({ ...c, nombre: nombreParte(c), cantidad: Number(c.cantidad) || 0, precioUnitario: Number(c.precioUnitario) || 0 }));

    if (!nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta el nombre de la promoción' });
      return;
    }
    if (comps.length === 0) {
      toast({ variant: 'destructive', title: 'Agrega al menos una prenda al paquete' });
      return;
    }
    const totalPrendas = comps.reduce((s, c) => s + c.cantidad, 0);
    if (totalPrendas < 2) {
      toast({ variant: 'destructive', title: 'Promoción muy pequeña', description: 'El paquete debe llevar al menos 2 prendas en total.' });
      return;
    }
    const incompleto = comps.find(c => c.cantidad <= 0 || c.precioUnitario <= 0 || c.prendas.length === 0);
    if (incompleto) {
      toast({ variant: 'destructive', title: 'Falta información', description: 'Cada parte del paquete necesita cantidad, precio por pieza y al menos una prenda.' });
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(firestore);
      const promoRef = editing ? doc(firestore, 'gruposOferta', editing.id) : doc(collection(firestore, 'gruposOferta'));
      const promoId = promoRef.id;

      const promoData = { tipo: 'especial' as const, nombre: nombre.trim(), precio: numPrecio, componentes: comps };
      if (editing) {
        batch.update(promoRef, { ...promoData, updatedAt: serverTimestamp() });
      } else {
        batch.set(promoRef, { ...promoData, createdAt: serverTimestamp() });
      }

      // Copia compacta que viaja en cada prenda (es lo que usa el carrito).
      const copia: PromoEspecial = {
        id: promoId,
        nombre: promoData.nombre,
        precio: numPrecio,
        componentes: comps.map(c => ({
          nombre: c.nombre,
          cantidad: c.cantidad,
          precioUnitario: c.precioUnitario,
          prendas: c.prendas.map(p => prendaPromoKey(p.pacaId, p.prendaId)),
        })),
      };

      const actuales = new Map<string, PrendaEnPromo>();
      comps.forEach(c => c.prendas.forEach(p => actuales.set(prendaPromoKey(p.pacaId, p.prendaId), p)));

      // Prendas que salieron de la promoción: se les quita la copia.
      const quitadas = new Set<string>();
      (editing?.componentes || []).forEach(c => (c.prendas || []).forEach(p => {
        const key = prendaPromoKey(p.pacaId, p.prendaId);
        if (!actuales.has(key) && !quitadas.has(key)) {
          quitadas.add(key);
          batch.update(doc(firestore, 'pacas', p.pacaId, 'prendas', p.prendaId), { [`promosEspeciales.${promoId}`]: deleteField() });
        }
      }));

      actuales.forEach(p => {
        batch.update(doc(firestore, 'pacas', p.pacaId, 'prendas', p.prendaId), { [`promosEspeciales.${promoId}`]: copia });
      });

      await batch.commit();
      toast({ variant: 'success', title: editing ? 'Promoción actualizada' : 'Promoción creada' });
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving promo especial:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la promoción. Si borraste alguna prenda del inventario, quítala de la promoción e inténtalo de nuevo.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!firestore || !promoToDelete) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(firestore);
      const vistas = new Set<string>();
      (promoToDelete.componentes || []).forEach(c => (c.prendas || []).forEach(p => {
        const key = prendaPromoKey(p.pacaId, p.prendaId);
        if (vistas.has(key)) return;
        vistas.add(key);
        batch.update(doc(firestore, 'pacas', p.pacaId, 'prendas', p.prendaId), { [`promosEspeciales.${promoToDelete.id}`]: deleteField() });
      }));
      batch.delete(doc(firestore, 'gruposOferta', promoToDelete.id));
      await batch.commit();
      toast({ variant: 'success', title: 'Promoción eliminada', description: 'Las prendas ya no tienen esta promoción.' });
      setPromoToDelete(null);
    } catch (error) {
      console.error('Error deleting promo especial:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la promoción.' });
    } finally {
      setIsSaving(false);
    }
  };

  const activeComponente = activeComp !== null ? componentes[activeComp] : null;
  const activeKeys = new Set((activeComponente?.prendas || []).map(p => prendaPromoKey(p.pacaId, p.prendaId)));

  return (
    <>
      <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
        <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="font-sans text-2xl text-black flex items-center gap-2">
              <Sparkles className="h-6 w-6" /> Promociones Especiales
            </CardTitle>
            <CardDescription className="font-sans font-semibold text-md text-black">
              Paquetes con precio especial, aunque mezclen prendas distintas. Ej: &quot;2 pantalones quirúrgicos por $130&quot; o &quot;Filipina + pantalón por $110&quot;. Cada prenda conserva su precio suelto del inventario; en Ventas y Apartados se aplica sola la combinación más barata para el cliente.
            </CardDescription>
          </div>
          <Button variant="destructive" className="font-sans text-sm text-black shrink-0" onClick={handleOpenCreate}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Promoción
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Paquete</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Cargando promociones...</TableCell></TableRow>
              ) : promos && promos.length > 0 ? (
                promos.map(promo => {
                  const r = rangoSuelto(promo.componentes || []);
                  return (
                    <TableRow key={promo.id}>
                      <TableCell className="font-medium">{promo.nombre}</TableCell>
                      <TableCell>
                        <p>{describirPaquete(promo.componentes || [])}</p>
                        {r && (
                          <p className="text-xs text-black/60">
                            Sueltas: {r.min === r.max ? formatMoney(r.min) : `${formatMoney(r.min)} – ${formatMoney(r.max)}`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><Badge variant="secondary">{formatMoney(promo.precio)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                            <DropdownMenuItem onClick={() => handleOpenEdit(promo as PromoDoc)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPromoToDelete(promo as PromoDoc)} className="text-red-600 focus:text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay promociones especiales.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.95)', backdropFilter: 'blur(12px)' }}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Promoción Especial' : 'Nueva Promoción Especial'}</DialogTitle>
            <DialogDescription>
              Busca las prendas de la promoción y pon cuánto vale cada una dentro del paquete. Si el paquete lleva prendas distintas (ej. filipina + pantalón), agrega otra parte.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] -mx-6 px-6">
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="promo-nombre">Nombre de la promoción</Label>
                  <Input id="promo-nombre" placeholder='Ej: "Filipina + pantalón"' value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={isSaving} className="bg-white/80" />
                </div>
                <div className="space-y-2">
                  <Label>Precio del paquete</Label>
                  <p className="h-10 flex items-center text-2xl font-bold">{formatMoney(numPrecio)}</p>
                  <p className="text-xs text-black/60 -mt-1">Se calcula con el precio de cada pieza.</p>
                </div>
              </div>

              {componentes.map((comp, idx) => {
                const esActiva = activeComp === idx;
                return (
                <Card key={idx} className={esActiva ? 'border-2 border-black' : ''}>
                  <CardContent className="space-y-3 pt-4">
                    {componentes.length > 1 && (
                      <p className="text-sm font-semibold">
                        Parte {idx + 1}{comp.prendas.length > 0 ? `: ${nombreParte(comp)}` : ''}
                      </p>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="space-y-1 w-20">
                        <Label htmlFor={`comp-cant-${idx}`}>Cantidad</Label>
                        <Input id={`comp-cant-${idx}`} type="number" min="1" value={comp.cantidad} onChange={(e) => updateComponente(idx, { cantidad: e.target.value === '' ? '' : Number(e.target.value) })} disabled={isSaving} className="bg-white/80" />
                      </div>
                      <div className="space-y-1 w-28">
                        <Label htmlFor={`comp-precio-${idx}`} className="whitespace-nowrap">Precio c/u ($)</Label>
                        <Input id={`comp-precio-${idx}`} type="number" min="0" step="0.01" placeholder="Ej: 65" value={comp.precioUnitario} onChange={(e) => updateComponente(idx, { precioUnitario: e.target.value === '' ? '' : Number(e.target.value) })} disabled={isSaving} className="bg-white/80" />
                      </div>
                      <div className="flex-1" />
                      {componentes.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeComponente(idx)} disabled={isSaving} title="Quitar esta parte">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </div>

                    <form onSubmit={handleSearch} className="flex gap-2">
                      <Input
                        placeholder="Buscar prenda por ID o nombre (ej: P5-2 o pantalon)"
                        value={esActiva ? searchText : ''}
                        onFocus={() => { if (!esActiva) { setActiveComp(idx); setSearchText(''); setResults(null); } }}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="bg-white/80"
                        disabled={isSaving}
                      />
                      <Button type="submit" size="icon" variant="destructive" className="text-black" disabled={isSaving || isSearching || !esActiva}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </form>

                    {esActiva && results && results.length > 0 && (
                      <div className="rounded-md border bg-white/80">
                        <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                          <span>{results.length} resultado(s)</span>
                          <Button type="button" size="sm" variant="outline" onClick={() => addPrendasToComponente(idx, results)} disabled={isSaving}>
                            Agregar todas
                          </Button>
                        </div>
                        <ul className="max-h-48 overflow-y-auto divide-y">
                          {results.map(r => {
                            const yaEsta = activeKeys.has(prendaPromoKey(r.pacaId, r.prendaId));
                            return (
                              <li key={prendaPromoKey(r.pacaId, r.prendaId)}>
                                <button
                                  type="button"
                                  disabled={yaEsta || isSaving}
                                  onClick={() => addPrendasToComponente(idx, [r])}
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-50"
                                >
                                  <span><span className="font-semibold">{r.idPersonalizado}</span> {r.tipoPrenda} {r.genero} {r.talla ? `Talla ${r.talla}` : ''}</span>
                                  <span className="shrink-0 text-xs text-right">
                                    {formatMoney(r.precio)}
                                    <span className="block text-black/60">{yaEsta ? 'Ya agregada' : `Stock: ${r.cantidad}`}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {comp.prendas.length > 0 ? comp.prendas.map(p => (
                        <Badge key={prendaPromoKey(p.pacaId, p.prendaId)} variant="outline" className="text-xs gap-1 bg-white/60">
                          <span className="font-semibold">{p.idPersonalizado}</span> {p.tipoPrenda} {p.talla ? `T${p.talla}` : ''} · suelta {formatMoney(p.precio)}
                          <button type="button" onClick={() => removePrenda(idx, p)} disabled={isSaving} aria-label={`Quitar ${p.idPersonalizado}`}>
                            <X className="h-3 w-3 text-red-600" />
                          </button>
                        </Badge>
                      )) : (
                        <p className="text-xs text-black/60">Aún no hay prendas aquí. Búscalas arriba.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                );
              })}

              <Button type="button" variant="outline" onClick={() => setComponentes(prev => [...prev, nuevoComponente()])} disabled={isSaving}>
                <PlusCircle className="mr-2 h-4 w-4" /> Agregar otra prenda distinta al paquete
              </Button>

              {numPrecio > 0 && (
                <div className="rounded-md bg-white/70 p-3 text-sm space-y-1">
                  <p className="font-semibold">{describirPaquete(componentes)} = {formatMoney(numPrecio)}</p>
                  {rango && (
                    <p>
                      Sueltas costarían {rango.min === rango.max ? formatMoney(rango.min) : `entre ${formatMoney(rango.min)} y ${formatMoney(rango.max)}`}
                      {rango.max > numPrecio && <> · ahorro para el cliente: hasta <span className="font-bold text-green-700">{formatMoney(rango.max - numPrecio)}</span></>}
                    </p>
                  )}
                  {rango && rango.max <= numPrecio && (
                    <p className="font-semibold text-red-700">Este precio no es menor que comprarlas sueltas, así que la promoción nunca se aplicará.</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} variant="destructive" className="text-black" disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar Promoción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!promoToDelete} onOpenChange={(open) => { if (!open) setPromoToDelete(null); }}>
        <AlertDialogContent className="font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la promoción &quot;{promoToDelete?.nombre}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus prendas dejarán de tener este precio especial y se venderán a su precio suelto (o con otras ofertas que tengan). Las ventas ya registradas no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>No, volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSaving} className="bg-red-600 text-white hover:bg-red-700">
              {isSaving ? 'Eliminando...' : 'Sí, eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
