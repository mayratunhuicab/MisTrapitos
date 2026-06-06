
"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, collectionGroup } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Package, ShoppingCart, ArrowRight, TrendingUp, TrendingDown, CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Paca = {
  id: string;
  idPersonalizado: string;
  nombrePaca: string;
  cantidadPrendas: number;
  costoPaca: number;
  costoEnvio: number;
  colorEtiqueta?: string;
  createdAt: any;
  ventaTotalPotencial?: number;
};

type Prenda = {
  id: string;
  pacaId: string;
  cantidad: number;
};

type Item = {
  id: string;
  pacaId: string;
  cantidad: number;
  precioVenta: number;
  _parentPath?: string;
};

type Apartado = {
  id: string;
  totalApartado: number;
  totalPagado: number;
  estado: 'VIGENTE' | 'LIQUIDADO' | 'CANCELADO';
};


// --- Componente para Tarjeta de Paca ---
function PacaSummaryCard({ pacaData }: { pacaData: Paca & { prendasRestantes: number; montoRecuperado: number; }}) {
    const { 
        id,
        nombrePaca,
        idPersonalizado,
        cantidadPrendas,
        costoPaca,
        costoEnvio,
        prendasRestantes,
        montoRecuperado
    } = pacaData;

    const costoTotal = costoPaca + costoEnvio;
    const porcentajeRecuperado = costoTotal > 0 ? (montoRecuperado / costoTotal) * 100 : 0;
    const ganancia = montoRecuperado - costoTotal;
    
    const isRecuperado = montoRecuperado >= costoTotal;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
        }).format(value);
    };

    return (
         <Card className="flex flex-col" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <CardHeader>
                <CardTitle className="text-black font-sans flex justify-between items-start">
                    <span>{nombrePaca}</span>
                     <Badge variant="secondary">{idPersonalizado}</Badge>
                </CardTitle>
                <CardDescription className="text-black/80 font-sans font-semibold">
                    Resumen financiero y de stock.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-grow">
                 <div className="text-sm">
                    <span className="font-semibold text-black/90 flex items-center gap-1">
                        <Package className="h-4 w-4" /> Prendas Restantes
                    </span>
                    <p className="font-bold text-black text-lg">{prendasRestantes} / {cantidadPrendas}</p>
                </div>
                 <div className="text-sm">
                    <span className="font-semibold text-black/90 flex items-center gap-1">
                        <DollarSign className="h-4 w-4" /> Costo Total
                    </span>
                    <p className="font-bold text-black text-lg">{formatCurrency(costoTotal)}</p>
                </div>
                <div className="text-sm">
                    <span className="font-semibold text-black/90 flex items-center gap-1">
                        <ShoppingCart className="h-4 w-4" /> Monto Recuperado
                    </span>
                    <p className="font-bold text-black text-lg">{formatCurrency(montoRecuperado)}</p>
                </div>
                
                <div>
                     <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                            <Progress value={Math.min(porcentajeRecuperado, 100)} className="w-full h-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Recuperado: {porcentajeRecuperado.toFixed(1)}%</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                </div>

                <div className="flex justify-between items-baseline text-sm pt-2 flex-wrap gap-x-2">
                    <span className="font-semibold text-black/90 flex items-center gap-1">
                        {ganancia >= 0 ? <TrendingUp className="h-4 w-4 text-green-700"/> : <TrendingDown className="h-4 w-4 text-red-700" />}
                        {ganancia >= 0 ? 'Ganancia' : 'Pérdida'}
                    </span>
                    <span className={`font-bold text-lg ${ganancia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(ganancia)}
                    </span>
                </div>

            </CardContent>
            <CardFooter className="border-t border-black/10 pt-4">
                 <Button asChild className="w-full text-black" variant="destructive">
                    <Link href={`/dashboard/inventory/${id}`}>
                       Gestionar Paca <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function DashboardPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  // Redirect employee to sales page
  useEffect(() => {
    if (!isUserLoading && user?.role === 'empleado') {
      router.replace('/dashboard/sales');
    }
  }, [user, isUserLoading, router]);

  // 1. Fetch all pacas - ONLY FOR ADMIN
  const pacasQuery = useMemoFirebase(() => {
    if (!firestore || !user || user.role !== 'admin') return null;
    return query(collection(firestore, 'pacas'));
  }, [firestore, user]);
  const { data: pacas, isLoading: isPacasLoading } = useCollection<Paca>(pacasQuery, { enabled: user?.role === 'admin' });
  
  // 2. Fetch all prendas - ONLY FOR ADMIN
  const prendasQuery = useMemoFirebase(() => {
      if (!firestore || !user || user.role !== 'admin') return null;
      return collectionGroup(firestore, 'prendas');
  }, [firestore, user]);
  const { data: todasPrendas, isLoading: isPrendasLoading } = useCollection<Prenda>(prendasQuery, { enabled: user?.role === 'admin' });
  
  // 3. Fetch all sold & layaway items from the 'items' collection group
  const itemsQuery = useMemoFirebase(() => {
      if (!firestore || !user || user.role !== 'admin') return null;
      return collectionGroup(firestore, 'items');
  }, [firestore, user]);
  const { data: todosLosItems, isLoading: isItemsLoading } = useCollection<Item>(itemsQuery, { enabled: user?.role === 'admin' });
  
  // 4. Fetch all apartados - ONLY FOR ADMIN
  const apartadosQuery = useMemoFirebase(() => {
    if (!firestore || !user || user.role !== 'admin') return null;
    return query(collection(firestore, 'apartados'));
  }, [firestore, user]);
  const { data: todosApartados, isLoading: isApartadosLoading } = useCollection<Apartado>(apartadosQuery, { enabled: user?.role === 'admin' });

  const pacasConResumen = useMemo(() => {
    if (!pacas || !todasPrendas || !todosLosItems || !todosApartados) return [];

    // 1. Separate items from 'ventas' and 'apartados' using the parent path
    const ventaItems = todosLosItems.filter(item => item._parentPath?.startsWith('ventas/'));
    const apartadoItems = todosLosItems.filter(item => item._parentPath?.startsWith('apartados/'));

    // 2. Create helper maps for efficient lookups
    const apartadosMap = new Map(todosApartados.map(a => [a.id, a]));
    const apartadoItemsMap = new Map<string, Item[]>();
    apartadoItems.forEach(item => {
        const apartadoId = item._parentPath?.split('/')[1];
        if (apartadoId) {
            if (!apartadoItemsMap.has(apartadoId)) {
                apartadoItemsMap.set(apartadoId, []);
            }
            apartadoItemsMap.get(apartadoId)!.push(item);
        }
    });

    return pacas.map(paca => {
      const prendasDeLaPaca = todasPrendas.filter(prenda => prenda.pacaId === paca.id);
      const prendasRestantes = prendasDeLaPaca.reduce((sum, prenda) => sum + prenda.cantidad, 0);

      // --- Calculate Monto Recuperado ---
      
      // From direct sales
      const ventasDirectasDePaca = ventaItems.filter(item => item.pacaId === paca.id);
      const montoRecuperadoVentas = ventasDirectasDePaca.reduce((sum, item) => sum + (item.precioVenta * item.cantidad), 0);
      
      // From layaways (apartados)
      let montoRecuperadoApartados = 0;
      const apartadosConPrendasDePaca = new Set<string>();
      apartadoItems.forEach(item => {
          if (item.pacaId === paca.id) {
              const apartadoId = item._parentPath?.split('/')[1];
              if (apartadoId) {
                  apartadosConPrendasDePaca.add(apartadoId);
              }
          }
      });
      
      apartadosConPrendasDePaca.forEach(apartadoId => {
          const apartado = apartadosMap.get(apartadoId);
          // If the layaway has a total value (it's not empty)
          // we count the paid amount towards recovery, even if cancelled.
          if (!apartado || apartado.totalApartado <= 0) return;

          const itemsDelApartado = apartadoItemsMap.get(apartadoId) || [];
          
          const valorPacaEnApartado = itemsDelApartado
              .filter(item => item.pacaId === paca.id)
              .reduce((sum, item) => sum + (item.precioVenta * item.cantidad), 0);
          
          const proporcion = valorPacaEnApartado / apartado.totalApartado;
          const montoPagadoEnApartado = apartado.totalPagado || 0;
          
          if (!isNaN(proporcion)) {
            montoRecuperadoApartados += montoPagadoEnApartado * proporcion;
          }
      });

      const montoRecuperado = montoRecuperadoVentas + montoRecuperadoApartados;
      
      return {
        ...paca,
        prendasRestantes,
        montoRecuperado
      };
    }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  }, [pacas, todasPrendas, todosLosItems, todosApartados]);

  const isLoading = isUserLoading || (user?.role === 'admin' && (isPacasLoading || isPrendasLoading || isItemsLoading || isApartadosLoading));
  
  // If user is an employee, show a redirecting message. The useEffect will handle the redirect.
  // This prevents the admin dashboard from ever attempting to render for an employee.
  if (isUserLoading || user?.role === 'empleado') {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-white text-2xl font-sans">Redirigiendo...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">Panel de Control</h1>
        <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
            Aquí tienes un resumen en tiempo real del estado de cada paca.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(3)].map((_, i) => (
             <Card key={i} className="flex flex-col" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
                <CardHeader>
                    <CardTitle className="h-6 bg-black/10 rounded w-3/4"></CardTitle>
                    <CardDescription className="h-4 bg-black/10 rounded w-1/2"></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 flex-grow animate-pulse">
                    <div className="h-5 bg-black/10 rounded w-full"></div>
                    <div className="h-5 bg-black/10 rounded w-full"></div>
                    <div className="h-5 bg-black/10 rounded w-full"></div>
                    <div className="h-3 bg-black/10 rounded w-full"></div>
                    <div className="h-5 bg-black/10 rounded w-full"></div>
                </CardContent>
                <CardFooter className="border-t border-black/10 pt-4">
                    <Button className="w-full" disabled>Cargando...</Button>
                </CardFooter>
            </Card>
          ))}
        </div>
      ) : pacasConResumen.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pacasConResumen.map(paca => (
                <PacaSummaryCard key={paca.id} pacaData={paca} />
            ))}
        </div>
      ) : (
         <Card className="mt-6" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
            <CardHeader className="items-center text-center">
                 <CircleHelp className="h-12 w-12 text-black/50 mx-auto" />
                <CardTitle className="text-2xl font-sans text-black">No hay pacas para mostrar</CardTitle>
                <CardDescription className="text-md font-sans font-semibold text-black">
                   Parece que aún no has registrado ninguna paca en tu inventario.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                 <Button asChild variant="destructive" className="text-black">
                    <Link href="/dashboard/inventory">
                        <Package className="mr-2 h-4 w-4" />
                        Ir al Inventario para agregar una
                    </Link>
                </Button>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
