
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Trash2, ShoppingCart, DollarSign, Receipt, Upload, Camera, Calendar as CalendarIcon, CircleUser, Pencil } from 'lucide-react';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { collection, query, where, getDocs, runTransaction, doc, writeBatch, serverTimestamp, addDoc, getDoc, DocumentReference, collectionGroup } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import Image from 'next/image';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type Prenda = {
  id: string; // Document ID
  pacaId: string;
  idPersonalizado: string;
  tipoPrenda: string;
  talla: string;
  genero: string;
  precioVenta: number;
  cantidad: number; // Stock available
  // Offer fields
  precioIndividual?: number;
  ofertaCantidad?: number;
  ofertaPrecio?: number;
};


type CartItem = Prenda & {
  cartId: string; // Unique identifier for each line item in the cart
  cantidadEnCarrito: number | '';
  precioAnulado?: number;
};


const CameraDialog = ({ onCapture, setPaymentProof }: { onCapture: (dataUrl: string) => void, setPaymentProof: (proof: string | null) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
     if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const getCameraPermission = useCallback(async () => {
    stopCamera();
    setCapturedImage(null);
    setHasCameraPermission(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setHasCameraPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      toast({
        variant: 'destructive',
        title: 'Acceso a la cámara denegado',
        description: 'Por favor, habilita los permisos de la cámara en tu navegador.',
      });
    }
  }, [stopCamera, toast]);
  
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };
  
  const handleRetake = () => {
     getCameraPermission();
  };

  return (
    <Dialog onOpenChange={(open) => {
      if (open) {
        getCameraPermission();
      } else {
        stopCamera();
        setCapturedImage(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/80 text-black">
          <Camera className="mr-2 h-4 w-4" /> Tomar Foto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
        <DialogHeader>
          <DialogTitle>Capturar Comprobante</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!capturedImage ? (
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
              {hasCameraPermission === false && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <Alert variant="destructive" className="w-auto">
                        <CircleUser className="h-4 w-4" />
                        <AlertTitle>Acceso denegado</AlertTitle>
                        <AlertDescription>
                          Revisa los permisos de la cámara.
                        </AlertDescription>
                    </Alert>
                </div>
              )}
               {hasCameraPermission === true && (
                <Button onClick={handleCapture} className="absolute bottom-4 left-1/2 -translate-x-1/2" variant="destructive">Capturar</Button>
               )}
            </div>
          ) : (
             <div className="space-y-2">
                <Image src={capturedImage} alt="Comprobante capturado" width={400} height={300} className="w-full rounded-md" />
                <div className="flex justify-center gap-2">
                    <Button onClick={handleRetake} variant="outline">Tomar de Nuevo</Button>
                    <DialogTrigger asChild>
                      <Button onClick={handleConfirm} variant="destructive">Confirmar Foto</Button>
                    </DialogTrigger>
                </div>
            </div>
          )}
           <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const calculateItemSubtotal = (item: CartItem): number => {
    const cantidad = Number(item.cantidadEnCarrito) || 0;
    if (cantidad === 0) return 0;

    if (item.precioAnulado !== undefined && item.precioAnulado !== null) {
        return cantidad * item.precioAnulado;
    }

    // Always use the single-item price for line-item subtotal display.
    // The bundle discount is calculated globally.
    const singlePrice = item.precioIndividual || item.precioVenta;
    return cantidad * singlePrice;
};

const PriceDisplay = ({ item }: { item: CartItem }) => {
    if (item.precioAnulado !== undefined && item.precioAnulado !== null) {
        return (
            <div className="text-xs text-right">
                <p className="font-bold text-blue-600">${item.precioAnulado.toFixed(2)}</p>
                <p className="line-through text-muted-foreground">${(item.precioIndividual ?? item.precioVenta).toFixed(2)}</p>
            </div>
        );
    }
    
    const hasOffer = item.ofertaCantidad && item.ofertaPrecio && item.ofertaCantidad > 0;
    const singlePrice = item.precioIndividual || item.precioVenta;

    if (hasOffer) {
        return (
            <div className="text-xs text-right">
                <p className="font-bold">${singlePrice.toFixed(2)} c/u</p>
                <p className="text-red-600 font-semibold">{item.ofertaCantidad} x ${item.ofertaPrecio?.toFixed(2)}</p>
            </div>
        );
    }
    return <p className="font-bold">${item.precioVenta.toFixed(2)}</p>;
};


export default function SalesPage() {
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentProof, setPaymentProof] = useState<string | null>(null); // To store image data URL
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saleDate, setSaleDate] = useState<Date | undefined>(undefined);
  const [montoPagado, setMontoPagado] = useState<number | ''>('');

  // State for price override dialog
  const [isPriceOverrideDialogOpen, setIsPriceOverrideDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CartItem | null>(null);
  const [newPrice, setNewPrice] = useState<number | ''>('');
  const [overrideQuantity, setOverrideQuantity] = useState<number | ''>(1);


  // Set the date on the client to avoid hydration errors
  useEffect(() => {
    if(!saleDate){
      setSaleDate(new Date());
    }
  }, [saleDate]);


  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !searchId) return;
    
    const trimmedId = searchId.trim().toUpperCase();
    if (!trimmedId) return;

    try {
      const prendasRef = collectionGroup(firestore, 'prendas');
      const prendasQuery = query(prendasRef, where('idPersonalizado', '==', trimmedId));
      
      const querySnapshot = await getDocs(prendasQuery);


      if (!querySnapshot.empty) {
        const prendaDoc = querySnapshot.docs[0];
        const prendaData = prendaDoc.data() as Omit<Prenda, 'id'>;
        
        const prendaFound: Prenda = {
          id: prendaDoc.id,
          pacaId: prendaDoc.ref.parent.parent!.id,
          ...prendaData
        };
        
        addToCart(prendaFound);
        setSearchId('');
      } else {
        toast({ variant: "destructive", title: "Prenda no encontrada", description: `No se encontró ninguna prenda con el ID "${trimmedId}".` });
      }
    } catch (error: any) {
        console.error("Error searching for prenda: ", error);
        if (error.code === 'permission-denied') {
             const permissionError = new FirestorePermissionError({
                path: 'prendas', // This is a collection group query, path is not specific
                operation: 'list',
             });
             errorEmitter.emit('permission-error', permissionError);
        } else {
            toast({ variant: "destructive", title: "Error de búsqueda", description: "No se pudo realizar la búsqueda en la base de datos." });
        }
    }
  };

  const addToCart = (prenda: Prenda) => {
    setCart(currentCart => {
      // Logic to check total stock for this prenda across all line items in the cart
      const totalInCartForThisPrenda = currentCart
        .filter(item => item.id === prenda.id && item.pacaId === prenda.pacaId)
        .reduce((sum, item) => sum + Number(item.cantidadEnCarrito), 0);

      if (totalInCartForThisPrenda >= prenda.cantidad) {
        toast({ variant: "destructive", title: "Stock insuficiente", description: `No hay más stock para la prenda ${prenda.idPersonalizado}.` });
        return currentCart;
      }
      
      // Try to find an existing line item for this prenda that is NOT discounted
      const existingItem = currentCart.find(item => 
        item.id === prenda.id && 
        item.pacaId === prenda.pacaId &&
        item.precioAnulado === undefined
      );

      if (existingItem) {
        // Increment quantity of the existing, non-discounted line item
        return currentCart.map(item =>
          item.cartId === existingItem.cartId 
            ? { ...item, cantidadEnCarrito: (Number(item.cantidadEnCarrito) || 0) + 1 } 
            : item
        );
      } else {
        // Add as a new line item
        return [...currentCart, { ...prenda, cartId: self.crypto.randomUUID(), cantidadEnCarrito: 1 }];
      }
    });
  };

  const updateCartQuantity = (cartId: string, newQuantityStr: string) => {
    const newQuantity = newQuantityStr === '' ? '' : parseInt(newQuantityStr, 10);

    setCart(currentCart => currentCart.map(item => {
        if (item.cartId === cartId) {
            if (newQuantity === '') {
                return { ...item, cantidadEnCarrito: '' };
            }
            if (newQuantity > 0 && newQuantity <= item.cantidad) {
                return { ...item, cantidadEnCarrito: newQuantity };
            }
            if (newQuantity > item.cantidad) {
                toast({ variant: "destructive", title: "Stock insuficiente", description: `Solo hay ${item.cantidad} unidades disponibles.` });
                return { ...item, cantidadEnCarrito: item.cantidad };
            }
            return { ...item, cantidadEnCarrito: 1 };
        }
        return item;
    }).filter(item => item.cantidadEnCarrito !== 0));
  };


  const removeFromCart = (cartId: string) => {
    setCart(currentCart => currentCart.filter(item => item.cartId !== cartId));
  };

    const cartSummary = useMemo(() => {
        const rawSubtotal = cart.reduce((total, item) => total + calculateItemSubtotal(item), 0);

        const offerGroups = new Map<string, CartItem[]>();
        
        // Group all individual item units that are eligible for offers
        cart.forEach(item => {
            if (item.ofertaCantidad && item.ofertaPrecio && item.precioAnulado === undefined) {
                const offerKey = `${item.ofertaCantidad}-${item.ofertaPrecio}`;
                if (!offerGroups.has(offerKey)) {
                    offerGroups.set(offerKey, []);
                }
                // Add one entry for each unit of quantity
                for (let i = 0; i < Number(item.cantidadEnCarrito); i++) {
                     offerGroups.get(offerKey)!.push(item);
                }
            }
        });

        let totalDiscount = 0;

        // Calculate discount for each offer group
        for (const [offerKey, items] of offerGroups.entries()) {
            const [ofertaCantidad, ofertaPrecio] = offerKey.split('-').map(Number);
            const numBundles = Math.floor(items.length / ofertaCantidad);

            if (numBundles > 0) {
                const itemsInBundles = numBundles * ofertaCantidad;
                
                // To calculate the discount, we get the raw price of the items that form the bundle
                // and subtract the offer price.
                // We sort by price to give the customer the best deal, applying the offer to the most expensive items.
                items.sort((a,b) => (b.precioIndividual ?? b.precioVenta) - (a.precioIndividual ?? a.precioVenta));

                const rawPriceOfBundledItems = items.slice(0, itemsInBundles)
                                                  .reduce((acc, it) => acc + (it.precioIndividual ?? it.precioVenta), 0);
                
                const dealPrice = numBundles * ofertaPrecio;
                totalDiscount += rawPriceOfBundledItems - dealPrice;
            }
        }

        const finalTotal = rawSubtotal - totalDiscount;

        return {
            rawSubtotal,
            discount: totalDiscount,
            total: finalTotal,
        };
    }, [cart]);
  
  const cambio = (Number(montoPagado) || 0) - cartSummary.total;
  
  const handleFinalizeSale = async () => {
    if (!firestore || !storage || cart.length === 0) {
         toast({ variant: "destructive", title: "Carrito vacío", description: "Agrega al menos una prenda para realizar la venta." });
        return;
    };
    
    const invalidItem = cart.find(item => item.cantidadEnCarrito === '' || Number(item.cantidadEnCarrito) <= 0);
    if (invalidItem) {
        toast({ variant: "destructive", title: "Cantidad inválida", description: `La prenda "${invalidItem.idPersonalizado}" tiene una cantidad inválida.` });
        return;
    }

    if (!saleDate) {
        toast({ variant: "destructive", title: "Fecha no seleccionada", description: "Por favor, elige una fecha para la venta." });
        return;
    }
    
    if (metodoPago === 'EFECTIVO' && (Number(montoPagado) || 0) < cartSummary.total) {
        toast({ variant: "destructive", title: "Monto insuficiente", description: "El monto pagado no puede ser menor que el total de la venta." });
        return;
    }

    if (metodoPago === 'TRANSFERENCIA' && !paymentProof) {
        toast({ variant: "destructive", title: "Comprobante requerido", description: "Por favor, adjunta una imagen del comprobante de pago." });
        return;
    }
    
    setIsProcessing(true);

    // --- Contained logic to determine the final list of items and prices ---
    const { totalVenta, itemsWithEffectivePrice } = (() => {
        const allItemUnits: { item: CartItem, effectivePrice: number }[] = [];
        const offerEligibleUnits: CartItem[] = [];

        cart.forEach(item => {
            const singlePrice = item.precioIndividual ?? item.precioVenta;
            const cantidad = Number(item.cantidadEnCarrito) || 0;
            
            if (item.precioAnulado !== undefined) {
                for (let i = 0; i < cantidad; i++) allItemUnits.push({ item, effectivePrice: item.precioAnulado });
            } else if (item.ofertaCantidad && item.ofertaPrecio) {
                for (let i = 0; i < cantidad; i++) offerEligibleUnits.push(item);
            } else {
                for (let i = 0; i < cantidad; i++) allItemUnits.push({ item, effectivePrice: singlePrice });
            }
        });

        const offerGroups = new Map<string, CartItem[]>();
        offerEligibleUnits.forEach(unit => {
            const offerKey = `${unit.ofertaCantidad}-${unit.ofertaPrecio}`;
            if (!offerGroups.has(offerKey)) offerGroups.set(offerKey, []);
            offerGroups.get(offerKey)!.push(unit);
        });

        for (const [offerKey, items] of offerGroups.entries()) {
            const [ofertaCantidad, ofertaPrecio] = offerKey.split('-').map(Number);
            const numBundles = Math.floor(items.length / ofertaCantidad);
            
            items.sort((a, b) => (b.precioIndividual ?? b.precioVenta) - (a.precioIndividual ?? a.precioVenta));

            if (numBundles > 0) {
                const effectivePrice = ofertaPrecio / ofertaCantidad;
                const bundledItems = items.slice(0, numBundles * ofertaCantidad);
                const remainingItems = items.slice(numBundles * ofertaCantidad);

                bundledItems.forEach(item => allItemUnits.push({ item, effectivePrice }));
                remainingItems.forEach(item => allItemUnits.push({ item, effectivePrice: item.precioIndividual ?? item.precioVenta }));
            } else {
                items.forEach(item => allItemUnits.push({ item, effectivePrice: item.precioIndividual ?? item.precioVenta }));
            }
        }
        
        const finalItemsToSave = new Map<string, {prendaId: string, pacaId: string, idPersonalizado: string, tipoPrenda: string, cantidad: number, precioVenta: number}>();
        let finalTotal = 0;

        for (const { item, effectivePrice } of allItemUnits) {
            finalTotal += effectivePrice;
            const key = `${item.id}-${effectivePrice}`;
            if(finalItemsToSave.has(key)) {
                finalItemsToSave.get(key)!.cantidad += 1;
            } else {
                finalItemsToSave.set(key, {
                    prendaId: item.id,
                    pacaId: item.pacaId,
                    idPersonalizado: item.idPersonalizado,
                    tipoPrenda: item.tipoPrenda,
                    cantidad: 1,
                    precioVenta: effectivePrice
                });
            }
        }

        return { totalVenta: finalTotal, itemsWithEffectivePrice: Array.from(finalItemsToSave.values()) };
    })();

    const ventaRef = doc(collection(firestore, "ventas"));

    try {
        let paymentProofUrl = null;
        if (metodoPago === 'TRANSFERENCIA' && paymentProof) {
          const imageRef = storageRef(storage, `comprobantes/${ventaRef.id}.png`);
          const uploadResult = await uploadString(imageRef, paymentProof, 'data_url');
          paymentProofUrl = await getDownloadURL(uploadResult.ref);
        }
        
        await runTransaction(firestore, async (transaction) => {
            const prendaRefsAndData = cart.map(item => ({
              ref: doc(firestore, 'pacas', item.pacaId, 'prendas', item.id),
              item: item
            }));

            const prendaDocs = await Promise.all(
              prendaRefsAndData.map(pad => transaction.get(pad.ref))
            );

            for (let i = 0; i < prendaDocs.length; i++) {
              const prendaDoc = prendaDocs[i];
              const { item } = prendaRefsAndData[i];
              const cantidadEnCarrito = Number(item.cantidadEnCarrito) || 0;
              if (!prendaDoc.exists()) {
                throw new Error(`La prenda ${item.idPersonalizado} ya no existe.`);
              }
              const currentStock = prendaDoc.data().cantidad;
              if (currentStock < cantidadEnCarrito) {
                throw new Error(`Stock insuficiente para ${item.idPersonalizado}. Solo quedan ${currentStock}.`);
              }
            }
            
            const ventaData = {
                totalVenta: totalVenta,
                metodoPago: metodoPago,
                comprobanteUrl: paymentProofUrl,
                fecha: saleDate,
                vendedorId: user?.uid || null,
            };
            transaction.set(ventaRef, ventaData);

            for (let i = 0; i < prendaDocs.length; i++) {
                const { ref, item } = prendaRefsAndData[i];
                const prendaDoc = prendaDocs[i];
                const cantidadEnCarrito = Number(item.cantidadEnCarrito) || 0;
                
                const newStock = prendaDoc.data().cantidad - cantidadEnCarrito;
                transaction.update(ref, { cantidad: newStock });
            }

            for (const ventaItemData of itemsWithEffectivePrice) {
                const ventaItemRef = doc(collection(ventaRef, "items"));
                transaction.set(ventaItemRef, ventaItemData);
            }
        });

        toast({ variant: "success", title: "Venta registrada", description: "La venta se ha completado y el stock ha sido actualizado." });
        setCart([]);
        setMetodoPago("EFECTIVO");
        setPaymentProof(null);
        setSaleDate(new Date());
        setMontoPagado('');

    } catch (error: any) {
        // Only emit FirestorePermissionError if it's actually a permission issue.
        // This prevents false positives during connectivity timeouts.
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: `ventas/${ventaRef.id}`,
              operation: 'write',
              requestResourceData: { 
                totalVenta,
                metodoPago,
                items: cart.map(i => ({ id: i.id, cantidad: i.cantidadEnCarrito })) 
              },
            });
            errorEmitter.emit('permission-error', permissionError);
        }

        console.error("Error al finalizar venta:", error);
        const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
        toast({ variant: "destructive", title: "Error en la transacción", description: errorMessage });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProof(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (metodoPago === 'EFECTIVO') {
        setPaymentProof(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
    } else {
        setMontoPagado('');
    }
  }, [metodoPago])

  const handleOpenPriceOverrideDialog = (item: CartItem) => {
    setItemToEdit(item);
    const effectivePrice = item.precioAnulado ?? item.precioIndividual ?? item.precioVenta;
    setNewPrice(effectivePrice);
    setOverrideQuantity(1); // Default to applying to 1 item
    setIsPriceOverrideDialogOpen(true);
  };

  const handleConfirmPriceOverride = () => {
    if (!itemToEdit || newPrice === '' || Number(newPrice) < 0 || overrideQuantity === '' || Number(overrideQuantity) <= 0) {
      toast({ variant: 'destructive', title: 'Datos inválidos', description: 'El precio y la cantidad deben ser válidos.' });
      return;
    }

    const qtyToOverride = Number(overrideQuantity);

    if (qtyToOverride > Number(itemToEdit.cantidadEnCarrito)) {
      toast({ variant: 'destructive', title: 'Cantidad excede el carrito', description: `No puedes aplicar el descuento a más de ${itemToEdit.cantidadEnCarrito} prendas.` });
      return;
    }

    setCart(currentCart => {
      const originalItemIndex = currentCart.findIndex(item => item.cartId === itemToEdit.cartId);
      if (originalItemIndex === -1) return currentCart;
      
      const originalItem = currentCart[originalItemIndex];
      const remainingQty = Number(originalItem.cantidadEnCarrito) - qtyToOverride;

      if (remainingQty <= 0) {
          return currentCart.map(item => 
              item.cartId === itemToEdit.cartId 
                  ? { ...item, precioAnulado: Number(newPrice) } 
                  : item
          );
      }

      const updatedOriginalItem = {
          ...originalItem,
          cantidadEnCarrito: remainingQty
      };

      const discountedItem: CartItem = {
          ...originalItem,
          cartId: self.crypto.randomUUID(),
          cantidadEnCarrito: qtyToOverride,
          precioAnulado: Number(newPrice)
      };

      const newCart = [...currentCart];
      newCart[originalItemIndex] = updatedOriginalItem;
      newCart.splice(originalItemIndex + 1, 0, discountedItem);
      
      return newCart;
    });

    setIsPriceOverrideDialogOpen(false);
    setItemToEdit(null);
    setNewPrice('');
    setOverrideQuantity(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 justify-between items-start">
        <div>
          <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Punto de Venta</h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">Registra una nueva venta escaneando o buscando por ID de prenda.</p>
        </div>
        <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"destructive"}
                   className={cn(
                    "w-[280px] justify-start text-left font-normal text-black font-sans text-sm",
                    !saleDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {saleDate ? format(saleDate, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 font-sans">
                <Calendar
                  mode="single"
                  selected={saleDate}
                  onSelect={setSaleDate}
                  initialFocus
                  locale={es}
                  disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                />
              </PopoverContent>
            </Popover>
            <Button asChild variant="destructive" className="font-sans text-sm text-black">
                <Link href="/dashboard/sales/history">
                  <Receipt className="mr-2 h-4 w-4" /> Historial de Ventas
                </Link>
            </Button>
        </div>
      </div>

       <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <CardHeader>
              <CardTitle className="font-sans text-2xl text-black">Buscar Prenda</CardTitle>
               <CardDescription className="font-sans font-semibold text-md text-black">
                Escanea o escribe el ID de la prenda para agregarla al carrito.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  ref={searchInputRef}
                  id="searchId"
                  placeholder="Ej: P1-25"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="bg-white/80"
                />
                <Button type="submit" size="icon" variant="destructive" className="text-black">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
            <CardHeader className="pt-4">
              <CardTitle className="font-sans text-2xl text-black flex items-center gap-2">
                <ShoppingCart className="h-6 w-6" /> Carrito de Compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-sans font-semibold text-sm text-black">ID</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black">Prenda</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-center">Cantidad</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-right">Precio</TableHead>
                    <TableHead className="font-sans font-semibold text-sm text-black text-right">Subtotal</TableHead>
                    <TableHead className="w-[100px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length > 0 ? (
                    cart.map(item => (
                      <TableRow key={item.cartId} className="font-sans text-xs">
                        <TableCell className="font-semibold">{item.idPersonalizado}</TableCell>
                        <TableCell>{item.tipoPrenda} {item.genero} Talla {item.talla}</TableCell>
                        <TableCell className="text-center">
                            <Input 
                                type="number"
                                value={item.cantidadEnCarrito}
                                onChange={(e) => updateCartQuantity(item.cartId, e.target.value)}
                                className="w-16 h-8 text-center mx-auto bg-white/70"
                                min="1"
                                max={item.cantidad}
                            />
                        </TableCell>
                         <TableCell className="text-right">
                           <PriceDisplay item={item} />
                        </TableCell>
                        <TableCell className="text-right font-bold">${calculateItemSubtotal(item).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            {user?.role === 'admin' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPriceOverrideDialog(item)}>
                                <Pencil className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromCart(item.cartId)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center font-sans font-semibold text-lg text-black">
                        El carrito está vacío.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
             <CardFooter className="flex flex-col items-stretch sm:flex-row sm:items-end sm:justify-between gap-6 pt-6 border-t-2 border-black/10">
                <div className="flex flex-col gap-4">
                    <div className="w-full sm:w-48">
                        <Label htmlFor="metodo-pago" className="font-sans font-semibold text-md text-black mb-1">Método de Pago</Label>
                        <Select value={metodoPago} onValueChange={setMetodoPago} disabled={isProcessing}>
                            <SelectTrigger id="metodo-pago" className="font-sans bg-white/80">
                                <SelectValue placeholder="Selecciona método" />
                            </SelectTrigger>
                            <SelectContent className="font-sans">
                                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {metodoPago === 'TRANSFERENCIA' && (
                        <div className="flex flex-col gap-2 items-start">
                            <div className="flex gap-2">
                                <Button variant="outline" className="bg-white/80 text-black" onClick={() => fileInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" /> Subir Comprobante
                                </Button>
                                 <CameraDialog onCapture={setPaymentProof} setPaymentProof={setPaymentProof} />
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                            </div>
                            {paymentProof && (
                                <div className="relative w-24 h-24 mt-2 border-2 border-dashed border-green-500 rounded-md p-1">
                                    <Image src={paymentProof} alt="Comprobante de pago" layout="fill" objectFit="cover" className="rounded"/>
                                    <Button variant="ghost" size="icon" className="absolute -top-3 -right-3 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full" onClick={() => setPaymentProof(null)}>
                                        <X className="h-4 w-4"/>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                    {cartSummary.discount > 0 && (
                        <>
                            <div className="font-sans text-lg text-black">
                                <span className="font-semibold mr-2">Subtotal:</span>
                                <span className="font-bold">
                                    ${cartSummary.rawSubtotal.toFixed(2)}
                                </span>
                            </div>
                            <div className="font-sans text-lg text-green-600">
                                <span className="font-semibold mr-2">Descuento por Oferta:</span>
                                <span className="font-bold">
                                    -${cartSummary.discount.toFixed(2)}
                                </span>
                            </div>
                        </>
                    )}
                     <div className="flex justify-between items-center font-sans text-3xl text-black">
                        <span className="font-semibold mr-2">Total:</span>
                        <span className="font-bold flex items-center gap-1">
                            <DollarSign className="h-6 w-6"/>
                            {cartSummary.total.toFixed(2)}
                        </span>
                    </div>

                    <AlertDialog onOpenChange={(open) => !open && setMontoPagado('')}>
                        <AlertDialogTrigger asChild>
                            <Button className="w-full sm:w-auto font-sans text-lg text-black" variant="destructive" disabled={cart.length === 0 || isProcessing || (metodoPago === 'TRANSFERENCIA' && !paymentProof)}>
                                {isProcessing ? 'Procesando...' : 'Finalizar Venta'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="font-sans bg-white text-black">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Venta</AlertDialogTitle>
                                <AlertDialogDescription>
                                    El total de la venta es <span className="font-bold">${cartSummary.total.toFixed(2)}</span>.
                                    {metodoPago === 'EFECTIVO' ? ' Por favor, ingresa el monto recibido para calcular el cambio.' : ' ¿Deseas registrar esta venta?'}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                             {metodoPago === 'EFECTIVO' && (
                                <div className="space-y-4 my-4">
                                     <div className="space-y-2">
                                        <Label htmlFor="montoPagado" className="font-semibold">Monto Recibido</Label>
                                        <Input 
                                            id="montoPagado"
                                            type="number"
                                            min="0"
                                            value={montoPagado}
                                            onChange={(e) => setMontoPagado(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Ej: 500"
                                            autoFocus
                                        />
                                    </div>
                                    {cambio >= 0 && montoPagado !== '' && (
                                         <div className="text-center font-bold text-2xl p-4 rounded-md bg-green-100 text-green-800">
                                            Cambio: ${cambio.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            )}
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={handleFinalizeSale} 
                                    variant="destructive" 
                                    className="font-sans text-sm"
                                    disabled={metodoPago === 'EFECTIVO' && (Number(montoPagado) || 0) < cartSummary.total}
                                >
                                    Sí, registrar venta
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardFooter>
          </Card>
        
      <Dialog open={isPriceOverrideDialogOpen} onOpenChange={setIsPriceOverrideDialogOpen}>
          <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
              <DialogHeader>
                  <DialogTitle>Anular Precio</DialogTitle>
                  <DialogDescription>
                    Aplica un precio especial a una o más unidades de "{itemToEdit?.idPersonalizado}".
                  </DialogDescription>
              </DialogHeader>
               <div className="py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="override-quantity">Cantidad a afectar</Label>
                          <Input
                              id="override-quantity"
                              type="number"
                              value={overrideQuantity}
                              onChange={(e) => setOverrideQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                              min="1"
                              max={Number(itemToEdit?.cantidadEnCarrito) || 1}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="new-price">Nuevo Precio Unitario</Label>
                          <Input
                              id="new-price"
                              type="number"
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="Ej: 50.00"
                              autoFocus
                          />
                      </div>
                  </div>
                  {itemToEdit && (
                      <div className="text-sm text-muted-foreground">
                          Precio original: <span className="line-through">${(itemToEdit.precioIndividual ?? itemToEdit.precioVenta).toFixed(2)}</span>
                      </div>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setIsPriceOverrideDialogOpen(false);
                    setItemToEdit(null);
                    setNewPrice('');
                  }}>Cancelar</Button>
                  <Button onClick={handleConfirmPriceOverride} variant="destructive" className="text-black">
                      Aplicar Precio
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
