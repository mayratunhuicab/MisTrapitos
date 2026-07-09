
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, PlusCircle, DollarSign, MoreHorizontal, Pencil, Trash2, FileDown, ArrowUpDown, FileText, Loader2, MinusCircle } from 'lucide-react';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, runTransaction, getDocs, query, where, orderBy, collectionGroup, writeBatch, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';

// Extend jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

// Data types
type Paca = {
  id: string;
  idPersonalizado: string;
  nombrePaca: string;
  cantidadPrendas: number;
  costoPaca: number;
  costoEnvio: number;
  ventaTotalPotencial: number;
  colorEtiqueta?: string;
  proveedor: string;
  fecha: { seconds: number; nanoseconds: number; } | Date;
  inventarioCompleto?: boolean;
  prendasRegistradas: number;
  prendaNextId?: number;
};

type Prenda = {
  id: string;
  idPersonalizado: string;
  tipoPrenda: string;
  talla: string;
  genero: string;
  precioVenta: number; // The effective unit price
  cantidad: number;
  createdAt: any;
  // Offer fields
  precioIndividual?: number;
  ofertaCantidad?: number;
  ofertaPrecio?: number;
};


type AppConfig = {
  isTallaEnabled?: boolean;
};

// Helper function to calculate unit price
const calcularPrecioUnitario = (costoPaca: number, costoEnvio: number, cantidadPrendas: number) => {
  if (cantidadPrendas > 0) {
    return (costoPaca + costoEnvio) / cantidadPrendas;
  }
  return 0;
};


// Helper function to convert to Title Case
const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

const FormDialogContent = ({
  title,
  description,
  tipoPrenda,
  setTipoPrenda,
  talla,
  setTalla,
  genero,
  setGenero,
  precioVenta,
  setPrecioVenta,
  cantidad,
  setCantidad,
  isSubmitting,
  selectedPrenda,
  costoUnitario,
  handleSaveChanges,
  isTallaEnabled,
  isConfigLoading,
  priceMode,
  setPriceMode,
  bulkQuantity,
  setBulkQuantity,
  bulkPrice,
  setBulkPrice,
  precioIndividual,
  setPrecioIndividual,
}: {
  title: string;
  description: string;
  tipoPrenda: string;
  setTipoPrenda: (value: string) => void;
  talla: string;
  setTalla: (value: string) => void;
  genero: string;
  setGenero: (value: string) => void;
  precioVenta: number | '';
  setPrecioVenta: (value: number | '') => void;
  cantidad: number | '';
  setCantidad: (value: number | '') => void;
  isSubmitting: boolean;
  selectedPrenda: Prenda | null;
  costoUnitario: number;
  handleSaveChanges: () => void;
  isTallaEnabled: boolean;
  isConfigLoading: boolean;
  priceMode: 'unit' | 'bulk';
  setPriceMode: (value: 'unit' | 'bulk') => void;
  bulkQuantity: number | '';
  setBulkQuantity: (value: number | '') => void;
  bulkPrice: number | '';
  setBulkPrice: (value: number | '') => void;
  precioIndividual: number | '';
  setPrecioIndividual: (value: number | '') => void;
}) => (
  <>
    <DialogHeader>
      <DialogTitle className="font-sans font-bold text-2xl">{title}</DialogTitle>
      <DialogDescription className="font-sans font-semibold text-md">{description}</DialogDescription>
    </DialogHeader>
    <ScrollArea className="max-h-[60vh] pr-4 -mr-4">
      <div className="space-y-4 py-4 pr-2">
        <div className="space-y-2">
          <Label htmlFor="tipoPrenda" className="font-semibold">Tipo de Prenda</Label>
          <Input id="tipoPrenda" placeholder="Ej: Camisa, Pantalon" value={tipoPrenda} onChange={(e) => setTipoPrenda(toTitleCase(e.target.value))} disabled={isSubmitting || isConfigLoading}/>
        </div>
        
        {isConfigLoading ? (
            <div className="space-y-2">
                <Label htmlFor="talla-loading" className="font-semibold">Talla</Label>
                <Skeleton id="talla-loading" className="h-10 w-full" />
            </div>
        ) : isTallaEnabled && (
            <div className="space-y-2">
                <Label htmlFor="talla" className="font-semibold">Talla</Label>
                <Input id="talla" placeholder="Ej: S, M, L, 32, 34" value={talla} onChange={(e) => setTalla(toTitleCase(e.target.value))} disabled={isSubmitting}/>
            </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="genero" className="font-semibold">Género</Label>
          <Select value={genero} onValueChange={setGenero} disabled={isSubmitting || isConfigLoading}>
            <SelectTrigger className="font-sans">
              <SelectValue placeholder="Selecciona un género" />
            </SelectTrigger>
            <SelectContent className="font-sans">
              <SelectItem value="DAMA">DAMA</SelectItem>
              <SelectItem value="CABALLERO">CABALLERO</SelectItem>
              <SelectItem value="NIÑO">NIÑO</SelectItem>
              <SelectItem value="NIÑA">NIÑA</SelectItem>
              <SelectItem value="JUVENIL DAMA">JUVENIL DAMA</SelectItem
              ><SelectItem value="JUVENIL CABALLERO">JUVENIL CABALLERO</SelectItem>
              <SelectItem value="UNISEX">UNISEX</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cantidad" className="font-semibold">Cantidad</Label>
          <Input id="cantidad" type="number" min="0" placeholder="Ej: 1, 5, 10" value={cantidad} onChange={(e) => setCantidad(e.target.value === '' ? '' : Number(e.target.value))} disabled={isSubmitting || isConfigLoading} />
        </div>
        
        <div className="space-y-2 rounded-md border border-input p-3">
          <Label className="font-semibold">Opciones de Precio</Label>
          <RadioGroup
              value={priceMode}
              onValueChange={(value) => setPriceMode(value as 'unit' | 'bulk')}
              className="pt-2"
              disabled={isSubmitting || isConfigLoading}
          >
              <div className="flex items-center space-x-2">
                  <RadioGroupItem value="unit" id="r-unit" />
                  <Label htmlFor="r-unit" className="font-normal">Precio por unidad</Label>
              </div>
              {priceMode === 'unit' && (
                  <div className="pl-6 pt-2">
                      <Input
                          id="precioVenta"
                          type="number"
                          min="0"
                          placeholder="Ej: 99.00"
                          value={precioVenta}
                          onChange={(e) => setPrecioVenta(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isSubmitting || isConfigLoading}
                      />
                  </div>
              )}
              <div className="flex items-center space-x-2 pt-2">
                  <RadioGroupItem value="bulk" id="r-bulk" />
                  <Label htmlFor="r-bulk" className="font-normal">Oferta (ej: 2 por $100)</Label>
              </div>
              {priceMode === 'bulk' && (
                  <>
                    <div className="grid grid-cols-2 gap-2 pl-6 pt-2">
                      <Input
                          id="bulkQuantity"
                          type="number"
                          min="1"
                          placeholder="Cantidad Lote"
                          value={bulkQuantity}
                          onChange={(e) => setBulkQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isSubmitting || isConfigLoading}
                      />
                      <Input
                          id="bulkPrice"
                          type="number"
                          min="0"
                          placeholder="Precio Lote"
                          value={bulkPrice}
                          onChange={(e) => setBulkPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isSubmitting || isConfigLoading}
                      />
                    </div>
                    <div className="space-y-2 pl-6 pt-2">
                        <Label htmlFor="precioIndividual" className="font-normal">Precio por 1 prenda</Label>
                        <Input
                           id="precioIndividual"
                           type="number"
                           min="0"
                           placeholder="Ej: 70.00"
                           value={precioIndividual}
                           onChange={(e) => setPrecioIndividual(e.target.value === '' ? '' : Number(e.target.value))}
                           disabled={isSubmitting || isConfigLoading}
                        />
                    </div>
                  </>
              )}
          </RadioGroup>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="costoPrenda" className="font-semibold">Costo Prenda</Label>
            <div className="flex items-center gap-2 font-bold text-lg p-2 rounded-md bg-white/50">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{costoUnitario.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="finalPrice" className="font-semibold text-green-800">Precio Venta Final</Label>
            <div className="flex items-center justify-center gap-2 font-bold text-lg p-2 rounded-md bg-green-100 text-green-800 border-2 border-green-300 min-h-[52px]">
              {priceMode === 'unit' ? (
                <>
                  <DollarSign className="h-4 w-4 text-green-700" />
                  <span>{Number(precioVenta) > 0 ? Number(precioVenta).toFixed(2) : '0.00'}</span>
                </>
              ) : (
                <div className="text-center text-sm">
                  {Number(bulkQuantity) > 0 && Number(bulkPrice) > 0 && (
                    <p className="font-bold">{`${bulkQuantity} x $${Number(bulkPrice).toFixed(2)}`}</p>
                  )}
                  {Number(precioIndividual) > 0 && (
                    <p className="font-semibold text-xs mt-1">(1 x ${Number(precioIndividual).toFixed(2)})</p>
                  )}
                  {!(Number(bulkQuantity) > 0 && Number(bulkPrice) > 0) && !(Number(precioIndividual) > 0) && (
                    <p className="text-xs font-normal">Define la oferta</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
    <DialogFooter>
      <Button onClick={handleSaveChanges} variant="destructive" className="font-sans text-sm text-black w-full" disabled={isSubmitting || isConfigLoading}>
        {isSubmitting || isConfigLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (selectedPrenda ? <Pencil className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />)}
        {isSubmitting ? 'Guardando...' : (isConfigLoading ? 'Cargando Config...' : (selectedPrenda ? 'Guardar Cambios' : 'Agregar Prenda(s) a la Paca'))}
      </Button>
    </DialogFooter>
  </>
);


export default function PacaDetailPage() {
  const params = useParams();
  const pacaId = params.pacaId as string;
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPrenda, setSelectedPrenda] = useState<Prenda | null>(null);

  // Form state
  const [tipoPrenda, setTipoPrenda] = useState('');
  const [talla, setTalla] = useState('');
  const [genero, setGenero] = useState('');
  const [precioVenta, setPrecioVenta] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState<number | ''>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [precioIndividual, setPrecioIndividual] = useState<number | ''>('');
  
  // Price mode state
  const [priceMode, setPriceMode] = useState<'unit' | 'bulk'>('unit');
  const [bulkQuantity, setBulkQuantity] = useState<number | ''>('');
  const [bulkPrice, setBulkPrice] = useState<number | ''>('');

  // Bulk edit state
  const [selectedPrendas, setSelectedPrendas] = useState<Set<string>>(new Set());
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
  const [newBulkPrice, setNewBulkPrice] = useState<number | ''>('');

  // Prendas pagination state
  const ITEMS_PER_PAGE = 50;
  const [prendas, setPrendas] = useState<Prenda[]>([]);
  const [isPrendasLoading, setIsPrendasLoading] = useState(true);
  const [isLoadingMorePrendas, setIsLoadingMorePrendas] = useState(false);
  const [lastPrendaDoc, setLastPrendaDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMorePrendas, setHasMorePrendas] = useState(true);

  // Alert Dialog State
  const [alertAction, setAlertAction] = useState<'defective' | 'deleteGroup' | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [prendaForAction, setPrendaForAction] = useState<Prenda | null>(null);


  type SortKey = keyof Prenda | 'createdAt';
  // Sort state
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'createdAt',
    direction: 'asc',
  });
  
  // --- App Config Fetch ---
  const configDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'app_config', 'settings');
  }, [firestore]);
  const { data: config, isLoading: isConfigLoading } = useDoc<AppConfig>(configDocRef);
  const isTallaEnabled = config?.isTallaEnabled ?? true;


  // Fetch paca details
  const pacaDocRef = useMemoFirebase(() => {
    if (!firestore || !pacaId || !user) return null;
    return doc(firestore, 'pacas', pacaId);
  }, [firestore, pacaId, user]);
  const { data: paca, isLoading: isPacaLoading, error: pacaError } = useDoc<Paca>(pacaDocRef);

  // Fetch prendas for the paca in batches
  const prendasCollectionRef = useMemoFirebase(() => {
    if (!firestore || !pacaId) return null;
    return collection(firestore, 'pacas', pacaId, 'prendas');
  }, [firestore, pacaId]);

  useEffect(() => {
    if (!firestore || !pacaId || !user || !prendasCollectionRef) {
      setPrendas([]);
      setIsPrendasLoading(false);
      setHasMorePrendas(false);
      setLastPrendaDoc(null);
      return;
    }

    let isCancelled = false;

    const loadInitialPrendas = async () => {
      setIsPrendasLoading(true);
      setIsLoadingMorePrendas(false);
      setLastPrendaDoc(null);
      setHasMorePrendas(true);

      const initialQuery = query(prendasCollectionRef, orderBy('createdAt', 'asc'), limit(ITEMS_PER_PAGE));
      const snapshot = await getDocs(initialQuery);

      if (!isCancelled) {
        const initialPrendas = snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as Prenda));
        setPrendas(initialPrendas);
        setLastPrendaDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
        setHasMorePrendas(snapshot.docs.length === ITEMS_PER_PAGE);
        setIsPrendasLoading(false);
      }
    };

    loadInitialPrendas();

    return () => {
      isCancelled = true;
    };
  }, [firestore, pacaId, user, prendasCollectionRef]);

  const handleLoadMorePrendas = useCallback(async () => {
    if (!firestore || !prendasCollectionRef || !lastPrendaDoc || isLoadingMorePrendas) return;

    setIsLoadingMorePrendas(true);

    try {
      const nextQuery = query(
        prendasCollectionRef,
        orderBy('createdAt', 'asc'),
        startAfter(lastPrendaDoc),
        limit(ITEMS_PER_PAGE)
      );
      const snapshot = await getDocs(nextQuery);
      const nextPrendas = snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as Prenda));

      setPrendas((prevPrendas) => [...prevPrendas, ...nextPrendas]);
      setLastPrendaDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMorePrendas(snapshot.docs.length === ITEMS_PER_PAGE);
    } finally {
      setIsLoadingMorePrendas(false);
    }
  }, [firestore, prendasCollectionRef, lastPrendaDoc, isLoadingMorePrendas]);
  
  useEffect(() => {
      const bq = Number(bulkQuantity);
      const bp = Number(bulkPrice);
      if (priceMode === 'bulk' && bq > 0 && bp >= 0) {
          setPrecioVenta(bp / bq);
      } else if (priceMode === 'unit') {
        setBulkQuantity('');
        setBulkPrice('');
        setPrecioIndividual('');
      }
  }, [priceMode, bulkQuantity, bulkPrice]);

  const sortedPrendas = useMemo(() => {
    let sortableItems = prendas ? [...prendas] : [];
    if (sortableItems && sortConfig.key) {
        const { key, direction } = sortConfig;
        sortableItems.sort((a, b) => {
            if (key === 'idPersonalizado') {
                const numA = parseInt(a.idPersonalizado.split('-')[1], 10);
                const numB = parseInt(b.idPersonalizado.split('-')[1], 10);
                if (numA < numB) return direction === 'asc' ? -1 : 1;
                if (numA > numB) return direction === 'asc' ? 1 : -1;
                return 0;
            }

            const aVal = a[key as keyof Prenda];
            const bVal = b[key as keyof Prenda];

            if (key === 'genero') {
                const order = ["DAMA", "CABALLERO", "JUVENIL DAMA", "JUVENIL CABALLERO", "NIÑA", "NIÑO", "UNISEX"];
                const aIndex = order.indexOf(aVal as string);
                const bIndex = order.indexOf(bVal as string);
                if (aIndex !== bIndex) {
                    if (direction === 'asc') {
                        return aIndex - bIndex;
                    }
                    return bIndex - aIndex;
                }
            }

            if (aVal < bVal) {
                return direction === 'asc' ? -1 : 1;
            }
            if (aVal > bVal) {
                return direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    return sortableItems;
  }, [prendas, sortConfig]);

  const selectedPrendasCount = useMemo(() => {
    if (selectedPrendas.size === 0) {
        return 0;
    }
    return (sortedPrendas || []).reduce((sum, prenda) => {
        if (selectedPrendas.has(prenda.id)) {
            return sum + prenda.cantidad;
        }
        return sum;
    }, 0);
  }, [selectedPrendas, sortedPrendas]);

  const costoUnitario = useMemo(() => {
      if (!paca) return 0;
      return calcularPrecioUnitario(paca.costoPaca, paca.costoEnvio || 0, paca.cantidadPrendas);
  }, [paca]);

  const prendasRegistradasEnStock = useMemo(() => {
    return prendas.reduce((sum, prenda) => sum + prenda.cantidad, 0) || 0;
  }, [prendas]);

  const resetForm = () => {
    setTipoPrenda('');
    setTalla('');
    setGenero('');
    setPrecioVenta('');
    setCantidad(1);
    setSelectedPrenda(null);
    setPriceMode('unit');
    setBulkQuantity('');
    setBulkPrice('');
    setPrecioIndividual('');
  };

  const handleOpenAddDialog = useCallback(() => {
    if (!paca) return;
    if (paca.inventarioCompleto || (paca.prendasRegistradas ?? 0) >= paca.cantidadPrendas) {
        toast({
            variant: "default",
            title: "Inventario Completo",
            description: "Ya se ha registrado el inventario inicial para esta paca.",
        });
        return;
    }
    resetForm();
    setIsAddDialogOpen(true);
  }, [paca, toast]);
  
  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSaveChanges = async () => {
    if (!firestore || !paca) {
        toast({ variant: "destructive", title: "Error", description: "Los datos de la paca no están listos. Intenta de nuevo." });
        return;
    }
    
    const ventaPrice = Number(precioVenta);
    const numCantidad = Number(cantidad);
    const numPrecioIndividual = Number(precioIndividual);
    const tallaToSave = isTallaEnabled ? talla : 'Única';

    if (!tipoPrenda || (isTallaEnabled && !tallaToSave) || !genero || ventaPrice <= 0 || numCantidad <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Completa todos los campos obligatorios. El precio y cantidad deben ser válidos." });
      return;
    }
    
    if (priceMode === 'bulk' && numPrecioIndividual <= 0) {
        toast({ variant: "destructive", title: "Precio individual requerido", description: "Para una oferta, debes especificar el precio de una sola prenda." });
        return;
    }

    setIsSubmitting(true);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const transactionPacaDocRef = doc(firestore, 'pacas', pacaId);
            
            const pacaDoc = await transaction.get(transactionPacaDocRef);
            if (!pacaDoc.exists()) throw new Error("La paca no existe.");
            
            const transactionPrendasCollectionRef = collection(transactionPacaDocRef, 'prendas');
            
            const allPrendasInPaca = (await getDocs(query(transactionPrendasCollectionRef))).docs.map(d => ({ id: d.id, ...d.data() } as Prenda));
            
            const currentPacaData = pacaDoc.data();
            const prendasYaRegistradas = currentPacaData.prendasRegistradas || 0;
            const cantidadPreviaEnEdicion = selectedPrenda ? selectedPrenda.cantidad : 0;
            const prendasNuevasAAgregar = numCantidad - cantidadPreviaEnEdicion;
            
            if (prendasNuevasAAgregar > 0 && (prendasYaRegistradas + prendasNuevasAAgregar) > currentPacaData.cantidadPrendas) {
                const disponibles = currentPacaData.cantidadPrendas - prendasYaRegistradas;
                const message = selectedPrenda 
                    ? `Solo puedes agregar ${Math.max(0, disponibles)} prenda(s) más a este grupo.`
                    : `Solo puedes registrar ${Math.max(0, disponibles)} prenda(s) más en total.`;
                throw new Error(`Límite de prendas excedido. ${message}`);
            }

            const formattedTipoPrenda = toTitleCase(tipoPrenda);
            const formattedTalla = toTitleCase(tallaToSave);
            let ventaTotalPotencialDelta = 0;
            
            const prendaPayload: Partial<Prenda> = {
                tipoPrenda: formattedTipoPrenda,
                talla: formattedTalla,
                genero,
                precioVenta: ventaPrice,
                cantidad: numCantidad,
            };

            if (priceMode === 'bulk') {
                prendaPayload.precioIndividual = numPrecioIndividual;
                prendaPayload.ofertaCantidad = Number(bulkQuantity);
                prendaPayload.ofertaPrecio = Number(bulkPrice);
            } else {
                prendaPayload.precioIndividual = undefined;
                prendaPayload.ofertaCantidad = undefined;
                prendaPayload.ofertaPrecio = undefined;
            }

            if (selectedPrenda) { // --- EDIT LOGIC ---
                const conflictDoc = allPrendasInPaca.find(p => 
                    p.id !== selectedPrenda.id &&
                    p.tipoPrenda === formattedTipoPrenda &&
                    p.talla === formattedTalla &&
                    p.genero === genero
                );
                if (conflictDoc) {
                   throw new Error("Ya existe otro grupo con esas características. Edita ese grupo o combina las cantidades.");
                }
                const prendaRef = doc(transactionPrendasCollectionRef, selectedPrenda.id);

                transaction.update(prendaRef, prendaPayload);
                ventaTotalPotencialDelta = (ventaPrice * numCantidad) - (selectedPrenda.precioVenta * selectedPrenda.cantidad);

            } else { // --- ADD LOGIC ---
                 const existingPrendaToMerge = allPrendasInPaca.find(p => 
                    p.tipoPrenda === formattedTipoPrenda &&
                    p.talla === formattedTalla &&
                    p.genero === genero
                );

                if (existingPrendaToMerge) { // Merge
                    const newQuantity = existingPrendaToMerge.cantidad + numCantidad;
                    const prendaRef = doc(transactionPrendasCollectionRef, existingPrendaToMerge.id);
                    transaction.update(prendaRef, { ...prendaPayload, cantidad: newQuantity });
                    ventaTotalPotencialDelta = (ventaPrice * newQuantity) - (existingPrendaToMerge.precioVenta * existingPrendaToMerge.cantidad);
                } else { // Add new
                    const nextId = currentPacaData.prendaNextId || 1;
                    const newIdPersonalizado = `${currentPacaData.idPersonalizado}-${nextId}`;
                    const newPrendaRef = doc(transactionPrendasCollectionRef);

                    transaction.set(newPrendaRef, {
                       ...prendaPayload,
                       idPersonalizado: newIdPersonalizado,
                       pacaId: pacaId,
                       createdAt: serverTimestamp(),
                    });
                    ventaTotalPotencialDelta = ventaPrice * numCantidad;
                    transaction.update(transactionPacaDocRef, { prendaNextId: nextId + 1 });
                }
            }
            
            const nuevasPrendasRegistradas = prendasYaRegistradas + prendasNuevasAAgregar;
            const nuevaVentaTotalPotencial = (currentPacaData.ventaTotalPotencial || 0) + ventaTotalPotencialDelta;
            const inventarioCompletoFinal = nuevasPrendasRegistradas >= currentPacaData.cantidadPrendas;

            transaction.update(transactionPacaDocRef, { 
                ventaTotalPotencial: nuevaVentaTotalPotencial,
                prendasRegistradas: nuevasPrendasRegistradas,
                inventarioCompleto: inventarioCompletoFinal,
            });
        });

        toast({ variant: "success", title: selectedPrenda ? "Prenda actualizada" : "Prenda agregada", description: "El inventario ha sido actualizado." });
        setIsAddDialogOpen(false);
        setIsEditDialogOpen(false);
        resetForm();

    } catch (error) {
        console.error("Error saving document: ", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo guardar la prenda.";
        toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleEdit = (prenda: Prenda) => {
    setSelectedPrenda(prenda);
    setTipoPrenda(prenda.tipoPrenda);
    setTalla(prenda.talla);
    setGenero(prenda.genero);
    setPrecioVenta(prenda.precioVenta);
    setCantidad(prenda.cantidad);
    setPriceMode(prenda.ofertaCantidad && prenda.ofertaPrecio ? 'bulk' : 'unit');
    setBulkQuantity(prenda.ofertaCantidad || '');
    setBulkPrice(prenda.ofertaPrecio || '');
    setPrecioIndividual(prenda.precioIndividual || '');
    setIsEditDialogOpen(true);
  };


  const handleRemoveDefectiveUnit = async (prendaToAdjust: Prenda) => {
    if (!firestore || !pacaId || !pacaDocRef || !paca) return;
    const prendaDocRef = doc(firestore, 'pacas', pacaId, 'prendas', prendaToAdjust.id);
    
    setIsSubmitting(true);
    try {
        await runTransaction(firestore, async (transaction) => {
            const pacaSnapshot = await transaction.get(pacaDocRef);
            if (!pacaSnapshot.exists()) throw new Error("Paca no encontrada.");
            
            const prendaSnapshot = await transaction.get(prendaDocRef);
            if (!prendaSnapshot.exists()) throw new Error("Prenda no encontrada para ajustar.");
            
            const pacaData = pacaSnapshot.data();
            const prendaData = prendaSnapshot.data();

            if (prendaData.cantidad > 1) {
                transaction.update(prendaDocRef, { cantidad: prendaData.cantidad - 1 });
            } else {
                transaction.delete(prendaDocRef);
            }

            const newTotalPrendasPaca = (pacaData.cantidadPrendas || 0) - 1;
            const nuevasPrendasRegistradas = (pacaData.prendasRegistradas || 0) - 1;
            const nuevaVentaTotalPotencial = (pacaData.ventaTotalPotencial || 0) - prendaData.precioVenta;

            transaction.update(pacaDocRef, { 
                cantidadPrendas: Math.max(0, newTotalPrendasPaca),
                prendasRegistradas: Math.max(0, nuevasPrendasRegistradas),
                ventaTotalPotencial: Math.max(0, nuevaVentaTotalPotencial),
             });
        });

        toast({ 
            variant: "success", 
            title: "Unidad Defectuosa Descontada", 
            description: "Se ha reducido el stock en una unidad y el total de la paca se ha ajustado." 
        });
    } catch (error) {
        console.error("Error adjusting defective unit: ", error);
        toast({ 
            variant: "destructive", 
            title: "Error", 
            description: "No se pudo ajustar el inventario." 
        });
    } finally {
        setIsSubmitting(false);
        setIsAlertOpen(false);
        setPrendaForAction(null);
    }
  };

  const handleDeletePrendaGroup = async (prendaToDelete: Prenda) => {
    if (!firestore || !pacaId || !pacaDocRef || !paca) return;
    const prendaDocRef = doc(firestore, 'pacas', pacaId, 'prendas', prendaToDelete.id);
    
    setIsSubmitting(true);
    try {
        await runTransaction(firestore, async (transaction) => {
            const pacaSnapshot = await transaction.get(pacaDocRef);
            if (!pacaSnapshot.exists()) throw new Error("Paca no encontrada.");
            
            const prendaSnapshot = await transaction.get(prendaDocRef);
            if (!prendaSnapshot.exists()) {
                throw new Error("El grupo de prendas ya no existe.");
            }
            
            const pacaData = pacaSnapshot.data();
            const prendaData = prendaSnapshot.data() as Prenda;

            // Delete the prenda document
            transaction.delete(prendaDocRef);

            // Update the paca's aggregate values
            const nuevasPrendasRegistradas = (pacaData.prendasRegistradas || 0) - prendaData.cantidad;
            const nuevaVentaTotalPotencial = (pacaData.ventaTotalPotencial || 0) - (prendaData.precioVenta * prendaData.cantidad);

            transaction.update(pacaDocRef, { 
                prendasRegistradas: Math.max(0, nuevasPrendasRegistradas),
                ventaTotalPotencial: Math.max(0, nuevaVentaTotalPotencial),
                inventarioCompleto: false, // Re-open inventory for corrections
            });
        });

        toast({ 
            variant: "success", 
            title: "Grupo de Prendas Eliminado", 
            description: "Se ha eliminado el grupo. El inventario se ha reabierto para correcciones."
        });
    } catch (error) {
        console.error("Error deleting prenda group: ", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo eliminar el grupo de prendas.";
        toast({ 
            variant: "destructive", 
            title: "Error en transacción", 
            description: errorMessage
        });
    } finally {
        setIsSubmitting(false);
        setIsAlertOpen(false);
        setPrendaForAction(null);
    }
  };

  const handleGeneratePDF = (includeTalla: boolean) => {
    if (!paca || !prendas) {
      toast({ variant: "destructive", title: "Error", description: "No hay datos para generar el PDF." });
      return;
    }
  
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- ADJUSTMENTS to fit more labels per page ---
    const margin = 6;
    const numCols = 3;
    const tagWidth = (pageWidth - (margin * (numCols + 1))) / numCols;
    const tagHeight = 30; // Reduced height
    const verticalGap = 3; // Space between rows
    // ---

    let x = margin;
    let y = margin;
  
    const allIndividualPrendas: Omit<Prenda, 'cantidad'>[] = [];
    prendas.forEach(grupo => {
      for (let i = 0; i < grupo.cantidad; i++) {
        allIndividualPrendas.push({ ...grupo });
      }
    });

    allIndividualPrendas.forEach((prenda, index) => {
      if (y + tagHeight > pageHeight - margin) {
        doc.addPage();
        x = margin;
        y = margin;
      }
  
      // Draw border for the tag
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, tagWidth, tagHeight, 2, 2, 'S');
  
      // --- Content (re-positioned for smaller size) ---
      const centerX = x + tagWidth / 2;

      // ID Line (top-left)
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${paca.idPersonalizado} / ${prenda.idPersonalizado}`, x + 3, y + 6); 

      // Description Line (centered and wrapped)
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      const tipoPrendaText = includeTalla && prenda.talla && prenda.talla !== 'Única'
        ? `${prenda.tipoPrenda} ${prenda.genero} / Talla: ${prenda.talla}`
        : `${prenda.tipoPrenda} ${prenda.genero}`;
      
      const descriptionLines = doc.splitTextToSize(tipoPrendaText, tagWidth - 6);
      doc.text(descriptionLines, centerX, y + 12, { align: 'center' });

      // Price Box (centered)
      const finalPrice = prenda.precioIndividual || prenda.precioVenta;
      const priceString = `$${finalPrice.toFixed(2)}`;
      const priceBoxHeight = 9;
      const priceBoxY = y + tagHeight - priceBoxHeight - 2;
      
      const priceBoxColor = paca.colorEtiqueta || '#E55572';
      doc.setFillColor(priceBoxColor);
      doc.roundedRect(x + 3, priceBoxY, tagWidth - 6, priceBoxHeight, 1.5, 1.5, 'F');

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0); // Black text
      doc.text(priceString, centerX, priceBoxY + 6.5, { align: 'center' });
      doc.setTextColor(0, 0, 0); // Reset text color
  
      // Move to next position
      x += tagWidth + margin;
      if ((index + 1) % numCols === 0) {
        x = margin;
        y += tagHeight + verticalGap;
      }
    });
  
    doc.save(`etiquetas_${paca.idPersonalizado}.pdf`);
    toast({ variant: "success", title: "PDF Generado", description: "Las etiquetas se han descargado." });
  };
  
    const handleGenerateInventoryPDF = () => {
    if (!paca || !sortedPrendas) {
      toast({ variant: "destructive", title: "Error", description: "No hay datos para generar el inventario." });
      return;
    }
  
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pacaDate = paca.fecha && 'seconds' in paca.fecha ? new Date(paca.fecha.seconds * 1000) : paca.fecha as Date;
    const costoTotalPaca = paca.costoPaca + paca.costoEnvio;
    const gananciaPotencial = paca.ventaTotalPotencial - costoTotalPaca;

    // Título y subtítulo
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(`Inventario de Paca: ${paca.nombrePaca} (${paca.idPersonalizado})`, 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 26);
    
    // Información de la Paca
    doc.autoTable({
        startY: 32,
        head: [['Proveedor', 'Fecha Ingreso', 'Costo Total', 'Prendas Totales']],
        body: [[
            paca.proveedor,
            pacaDate ? format(pacaDate, "dd/MM/yyyy") : 'N/A',
            `$${costoTotalPaca.toFixed(2)}`,
            paca.cantidadPrendas
        ]],
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
    });

    // Tabla de Prendas
    const tableBody = sortedPrendas.map(p => [
        p.idPersonalizado,
        p.tipoPrenda,
        p.genero,
        p.talla === 'Única' ? '----' : p.talla,
        p.cantidad,
        `$${costoUnitario.toFixed(2)}`,
        `$${p.precioVenta.toFixed(2)}`,
        `$${(p.precioVenta * p.cantidad).toFixed(2)}`
    ]);

    const finalY = (doc as any).lastAutoTable.finalY;

    doc.autoTable({
      startY: finalY + 10,
      head: [['ID', 'Tipo Prenda', 'Género', 'Talla', 'Cant.', 'Costo U.', 'Venta U.', 'Subtotal']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [39, 174, 96] },
      didDrawPage: (data) => {
        // Footer en cada página
        doc.setFontSize(8);
        doc.text(`Página ${data.pageNumber}`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
      }
    });

    // Resumen Financiero
     const finalY2 = (doc as any).lastAutoTable.finalY;
     doc.autoTable({
        startY: finalY2 + 10,
        head: [['Prendas Registradas', 'Venta Potencial', 'Costo Paca', 'Ganancia Potencial']],
        body: [[
            `${prendasRegistradasEnStock} / ${paca.cantidadPrendas}`,
            `$${paca.ventaTotalPotencial.toFixed(2)}`,
            `$${costoTotalPaca.toFixed(2)}`,
            `$${gananciaPotencial.toFixed(2)}`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [230, 126, 34] },
        bodyStyles: { fontStyle: 'bold' }
    });

    doc.save(`inventario_${paca.idPersonalizado}.pdf`);
    toast({ variant: "success", title: "Inventario PDF Generado", description: "El reporte de inventario se ha descargado." });
  };
  
    const handleSelectPrenda = (prendaId: string, isSelected: boolean) => {
        setSelectedPrendas(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(prendaId);
            } else {
                newSet.delete(prendaId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (isSelected: boolean) => {
        if (isSelected) {
            const allIds = new Set(sortedPrendas.map(p => p.id));
            setSelectedPrendas(allIds);
        } else {
            setSelectedPrendas(new Set());
        }
    };
    
    const handleBulkUpdate = async () => {
        if (!firestore || !paca || !pacaDocRef || !prendas) return;
        if (selectedPrendas.size === 0) return;
        const price = Number(newBulkPrice);
        if (isNaN(price) || price < 0) {
            toast({ variant: 'destructive', title: 'Precio inválido', description: 'El precio debe ser un número válido.' });
            return;
        }

        setIsSubmitting(true);
        const batch = writeBatch(firestore);

        try {
            let ventaTotalPotencialActualizado = 0;
            
            prendas.forEach(prenda => {
                if (selectedPrendas.has(prenda.id)) {
                    ventaTotalPotencialActualizado += price * prenda.cantidad;
                    const prendaRef = doc(firestore, 'pacas', paca.id, 'prendas', prenda.id);
                    batch.update(prendaRef, { precioVenta: price });
                } else {
                    ventaTotalPotencialActualizado += prenda.precioVenta * prenda.cantidad;
                }
            });

            batch.update(pacaDocRef, { ventaTotalPotencial: ventaTotalPotencialActualizado });

            await batch.commit();
            toast({ variant: 'success', title: 'Precios actualizados', description: `${selectedPrendas.size} grupos de prendas han sido actualizados.` });
            setIsBulkEditDialogOpen(false);
            setSelectedPrendas(new Set());
            setNewBulkPrice('');

        } catch (error) {
            console.error('Error updating prices in bulk:', error);
            const errorMessage = error instanceof Error ? error.message : "No se pudieron guardar los cambios.";
            toast({ variant: 'destructive', title: 'Error al actualizar', description: errorMessage });
        } finally {
            setIsSubmitting(false);
        }
    };


  const isLoading = isUserLoading || isPacaLoading || isPrendasLoading;

  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-screen">
            <p className="text-white text-2xl">Cargando datos de la paca...</p>
        </div>
    );
  }

  if (pacaError) {
      console.error("Error al cargar la paca:", pacaError);
      return (
          <div className="flex justify-center items-center h-screen">
              <p className="text-white text-2xl">Error al cargar los datos de la paca.</p>
          </div>
      );
  }

  if (!isPacaLoading && !paca) {
     return (
        <div className="flex flex-col justify-center items-center h-screen text-center">
            <p className="text-white text-2xl font-bold mb-4">Paca no encontrada.</p>
            <p className="text-white/80 mb-8">No se pudo encontrar la paca que estás buscando.</p>
            <Button asChild variant="destructive" className="text-black">
                <Link href="/dashboard/inventory">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver al Inventario
                </Link>
            </Button>
        </div>
    );
  }

  const isAgregarPrendaDisabled = Boolean(paca && (paca.inventarioCompleto || (paca.prendasRegistradas ?? 0) >= paca.cantidadPrendas));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-4">
            <Button asChild variant="destructive" size="icon" className="h-8 w-8 text-black flex-shrink-0">
                <Link href="/dashboard/inventory">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    <span className="sr-only">Volver a Inventario</span>
                </Link>
            </Button>
            <div>
            <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
                Detalle de Paca: {paca?.nombrePaca || 'Cargando...'} ({paca?.idPersonalizado})
            </h1>
            <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                Registra las prendas una por una o agrúpalas por características.
            </p>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end items-stretch sm:items-center">
            {selectedPrendas.size > 0 && (
                <Dialog open={isBulkEditDialogOpen} onOpenChange={setIsBulkEditDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" className="font-sans text-sm text-black">
                            <Pencil className="mr-2 h-4 w-4" /> Modificar Selección ({selectedPrendas.size})
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                        <DialogHeader>
                            <DialogTitle>Modificar Precio en Lote</DialogTitle>
                            <DialogDescription>
                                Ingresa el nuevo precio de venta para los {selectedPrendas.size} grupos de prendas seleccionados.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                             <Label htmlFor="bulk-price">Nuevo Precio de Venta</Label>
                             <Input 
                                id="bulk-price"
                                type="number" 
                                value={newBulkPrice}
                                onChange={(e) => setNewBulkPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder="Ej: 99.99"
                                disabled={isSubmitting}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsBulkEditDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleBulkUpdate} disabled={isSubmitting} variant="destructive" className="text-black">
                                {isSubmitting ? 'Aplicando...' : 'Aplicar Cambios'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                setIsAddDialogOpen(isOpen);
                if (!isOpen) resetForm();
            }}>
                <DialogTrigger asChild>
                    <Button onClick={handleOpenAddDialog} variant="destructive" className="font-sans text-sm text-black" disabled={isAgregarPrendaDisabled}>
                        <PlusCircle className="mr-2 h-4 w-4" /> 
                        Agregar Prenda
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                    <FormDialogContent
                        title="Agregar Nuevas Prendas"
                        description="Añade los detalles y la cantidad de las prendas."
                        tipoPrenda={tipoPrenda}
                        setTipoPrenda={setTipoPrenda}
                        talla={talla}
                        setTalla={setTalla}
                        genero={genero}
                        setGenero={setGenero}
                        precioVenta={precioVenta}
                        setPrecioVenta={setPrecioVenta}
                        cantidad={cantidad}
                        setCantidad={setCantidad}
                        isSubmitting={isSubmitting}
                        selectedPrenda={null}
                        costoUnitario={costoUnitario}
                        handleSaveChanges={handleSaveChanges}
                        isTallaEnabled={isTallaEnabled}
                        isConfigLoading={isConfigLoading}
                        priceMode={priceMode}
                        setPriceMode={setPriceMode}
                        bulkQuantity={bulkQuantity}
                        setBulkQuantity={setBulkQuantity}
                        bulkPrice={bulkPrice}
                        setBulkPrice={setBulkPrice}
                        precioIndividual={precioIndividual}
                        setPrecioIndividual={setPrecioIndividual}
                    />
                </DialogContent>
            </Dialog>

            {prendas && prendas.length > 0 && (
              <>
                {paca && paca.inventarioCompleto && (
                    <Button onClick={() => handleGeneratePDF(true)} variant="destructive" className="font-sans text-sm text-black">
                        <FileDown className="mr-2 h-4 w-4" />
                        Generar Etiquetas
                    </Button>
                )}
                <Button onClick={handleGenerateInventoryPDF} variant="destructive" className="font-sans text-sm text-black" disabled={!paca || !paca.inventarioCompleto}>
                  <FileText className="mr-2 h-4 w-4" />
                  Generar Inventario
                </Button>
              </>
            )}
        </div>


        {/* Dialog for Editing */}
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) resetForm();
        }}>
            <DialogContent className="sm:max-w-[425px] font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                 <FormDialogContent
                   title="Editar Prenda"
                   description="Actualiza cualquier detalle de la prenda."
                   tipoPrenda={tipoPrenda}
                   setTipoPrenda={setTipoPrenda}
                   talla={talla}
                   setTalla={setTalla}
                   genero={genero}
                   setGenero={setGenero}
                   precioVenta={precioVenta}
                   setPrecioVenta={setPrecioVenta}
                   cantidad={cantidad}
                   setCantidad={setCantidad}
                   isSubmitting={isSubmitting}
                   selectedPrenda={selectedPrenda}
                   costoUnitario={costoUnitario}
                   handleSaveChanges={handleSaveChanges}
                   isTallaEnabled={isTallaEnabled}
                   isConfigLoading={isConfigLoading}
                   priceMode={priceMode}
                   setPriceMode={setPriceMode}
                   bulkQuantity={bulkQuantity}
                   setBulkQuantity={setBulkQuantity}
                   bulkPrice={bulkPrice}
                   setBulkPrice={setBulkPrice}
                   precioIndividual={precioIndividual}
                   setPrecioIndividual={setPrecioIndividual}
                 />
            </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
           <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <CardHeader>
              <CardTitle className="font-sans text-2xl text-black">Prendas Registradas</CardTitle>
              <CardDescription className="font-sans font-semibold text-md text-black flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span>Lista de prendas en esta paca.</span>
                {paca && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedPrendasCount > 0 ? 'destructive' : (paca.inventarioCompleto ? 'default' : 'secondary')} className="text-sm">
                      {selectedPrendasCount > 0
                          ? `${selectedPrendasCount} de ${paca.cantidadPrendas} seleccionadas`
                          : `${paca.prendasRegistradas || 0} de ${paca.cantidadPrendas} registradas`
                      }
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Mostrando {prendas.length} de {paca.prendasRegistradas || 0} prendas
                    </Badge>
                  </div>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] px-2">
                        <Checkbox
                           checked={Boolean(prendas && prendas.length > 0 && selectedPrendas.size === prendas.length)}
                           onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                           aria-label="Seleccionar todo"
                        />
                    </TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black">
                       <Button variant="ghost" className="px-1" onClick={() => requestSort('idPersonalizado')}>
                        ID Prenda
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black">Tipo</TableHead>
                    <TableHead className="hidden md:table-cell font-sans font-semibold text-sm text-black">
                      Talla
                    </TableHead>
                    <TableHead className="hidden lg:table-cell font-sans font-semibold text-sm text-black">
                      <Button variant="ghost" className="px-1" onClick={() => requestSort('genero')}>
                        Género
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right font-sans font-semibold text-sm text-black">
                       <Button variant="ghost" className="px-1" onClick={() => requestSort('cantidad')}>
                        Cantidad
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right font-sans font-semibold text-sm text-black">Costo Unit.</TableHead>
                    <TableHead className="text-right font-sans font-semibold text-sm text-black">Venta Unit.</TableHead>
                    <TableHead className="text-right font-sans font-semibold text-sm text-black">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPrendasLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        Cargando prendas...
                      </TableCell>
                    </TableRow>
                  ) : sortedPrendas && sortedPrendas.length > 0 ? (
                    <>
                      {sortedPrendas.map((prenda) => (
                        <TableRow key={prenda.id} className="font-sans text-xs" data-state={selectedPrendas.has(prenda.id) && "selected"}>
                          <TableCell className="px-2">
                              <Checkbox
                                  checked={selectedPrendas.has(prenda.id)}
                                  onCheckedChange={(checked) => handleSelectPrenda(prenda.id, !!checked)}
                                  aria-label="Seleccionar fila"
                              />
                          </TableCell>
                          <TableCell className="font-semibold">{prenda.idPersonalizado}</TableCell>
                          <TableCell>{prenda.tipoPrenda}</TableCell>
                          <TableCell className="hidden md:table-cell">
                              <Badge variant="outline">{prenda.talla === 'Única' ? '----' : prenda.talla}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">{prenda.genero}</TableCell>
                          <TableCell className="text-right font-bold">{prenda.cantidad}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">${costoUnitario.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold">${prenda.precioVenta.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Abrir menú</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleEdit(prenda)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar Grupo
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-black/50" />
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => { setPrendaForAction(prenda); setAlertAction('defective'); setIsAlertOpen(true); }}>
                                  <MinusCircle className="mr-2 h-4 w-4" />
                                  Descontar Defectuosa
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => { setPrendaForAction(prenda); setAlertAction('deleteGroup'); setIsAlertOpen(true); }} className="text-red-600 focus:text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar Grupo
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      {hasMorePrendas && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-3 text-center">
                            <Button
                              variant="outline"
                              className="font-sans text-sm"
                              onClick={handleLoadMorePrendas}
                              disabled={isLoadingMorePrendas}
                            >
                              {isLoadingMorePrendas ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Cargando...
                                </>
                              ) : (
                                `Cargar siguientes ${ITEMS_PER_PAGE} prendas`
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        Aún no hay prendas registradas.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="font-sans bg-white text-black">
          <AlertDialogHeader>
            <AlertDialogTitle>
                {alertAction === 'defective' && '¿Descontar prenda defectuosa?'}
                {alertAction === 'deleteGroup' && '¿Eliminar grupo de prendas?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
                {alertAction === 'defective' && `Esta acción descontará 1 unidad del grupo de prendas "${prendaForAction?.idPersonalizado}" y ajustará los totales de la paca. Esto es para cuando una prenda física está dañada.`}
                {alertAction === 'deleteGroup' && `Esta acción no se puede deshacer. Se eliminará permanentemente el grupo completo de ${prendaForAction?.cantidad} prenda(s) "${prendaForAction?.tipoPrenda}" (ID: ${prendaForAction?.idPersonalizado}). Use esto para corregir un error al registrar el inventario.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPrendaForAction(null)} disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
                onClick={() => {
                    if (isSubmitting) return;
                    if (alertAction === 'defective' && prendaForAction) {
                        handleRemoveDefectiveUnit(prendaForAction);
                    } else if (alertAction === 'deleteGroup' && prendaForAction) {
                        handleDeletePrendaGroup(prendaForAction);
                    }
                }}
                className="font-sans text-sm bg-red-600 text-white hover:bg-red-700"
                disabled={isSubmitting}
            >
              {isSubmitting ? 'Procesando...' : (alertAction === 'defective' ? 'Sí, descontar unidad' : 'Sí, eliminar grupo')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </div>
  );
}
