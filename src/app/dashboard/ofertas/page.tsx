
"use client";

import { useState, useEffect, useCallback } from 'react';
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
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Search, X, Tags } from "lucide-react";
import { useFirestore } from "@/firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  deleteField,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { useToast } from '@/hooks/use-toast';
import { PromosEspecialesSection } from './promos-especiales';

// --- Types ---
type Miembro = {
  pacaId: string;
  prendaId: string;
  idPersonalizado: string;
  tipoPrenda: string;
};

type GrupoOferta = {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  miembros: Miembro[];
};

export default function OfertasPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [grupos, setGrupos] = useState<GrupoOferta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<GrupoOferta | null>(null);
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState<number | ''>('');
  const [precio, setPrecio] = useState<number | ''>('');
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [searchId, setSearchId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [grupoToDelete, setGrupoToDelete] = useState<GrupoOferta | null>(null);

  const fetchGrupos = useCallback(async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(firestore, 'gruposOferta'));
      // Las promociones especiales viven en la misma colección (tipo "especial") y se
      // administran en su propia sección; aquí solo van los grupos "N por $X".
      const data = snapshot.docs
        .filter(d => d.data().tipo !== 'especial')
        .map(d => ({ id: d.id, ...(d.data() as Omit<GrupoOferta, 'id'>) }));
      setGrupos(data);
    } catch (error) {
      console.error('Error loading grupos de oferta:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los grupos de oferta.' });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, toast]);

  useEffect(() => {
    fetchGrupos();
  }, [fetchGrupos]);

  const resetForm = () => {
    setEditingGrupo(null);
    setNombre('');
    setCantidad('');
    setPrecio('');
    setMiembros([]);
    setSearchId('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (grupo: GrupoOferta) => {
    setEditingGrupo(grupo);
    setNombre(grupo.nombre);
    setCantidad(grupo.cantidad);
    setPrecio(grupo.precio);
    setMiembros(grupo.miembros || []);
    setSearchId('');
    setIsDialogOpen(true);
  };

  const handleSearchPrenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !searchId.trim()) return;
    const trimmedId = searchId.trim().toUpperCase();

    try {
      const prendasRef = collectionGroup(firestore, 'prendas');
      const prendasQuery = query(prendasRef, where('idPersonalizado', '==', trimmedId));
      const snapshot = await getDocs(prendasQuery);

      if (snapshot.empty) {
        toast({ variant: 'destructive', title: 'Prenda no encontrada' });
        return;
      }

      const prendaDoc = snapshot.docs[0];
      const prendaData = prendaDoc.data();
      const pacaId = prendaDoc.ref.parent.parent!.id;

      const yaAgregada = miembros.some(m => m.pacaId === pacaId && m.prendaId === prendaDoc.id);
      if (yaAgregada) {
        toast({ variant: 'destructive', title: 'Ya está en este grupo' });
        return;
      }

      if (prendaData.grupoOfertaId && prendaData.grupoOfertaId !== editingGrupo?.id) {
        toast({
          title: 'Prenda movida de grupo',
          description: `"${trimmedId}" pertenecía a otro grupo de oferta; al guardar, se moverá a "${nombre || 'este grupo'}".`,
        });
      }

      setMiembros(prev => [...prev, {
        pacaId,
        prendaId: prendaDoc.id,
        idPersonalizado: prendaData.idPersonalizado,
        tipoPrenda: prendaData.tipoPrenda,
      }]);
      setSearchId('');
    } catch (error) {
      console.error('Error searching for prenda:', error);
      toast({ variant: 'destructive', title: 'Error de búsqueda' });
    }
  };

  const handleRemoveMiembro = (pacaId: string, prendaId: string) => {
    setMiembros(prev => prev.filter(m => !(m.pacaId === pacaId && m.prendaId === prendaId)));
  };

  const handleSaveGrupo = async () => {
    if (!firestore) return;
    const numCantidad = Number(cantidad);
    const numPrecio = Number(precio);

    if (!nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta el nombre del grupo' });
      return;
    }
    if (numCantidad < 2) {
      toast({ variant: 'destructive', title: 'Cantidad inválida', description: 'La oferta debe ser de al menos 2 prendas.' });
      return;
    }
    if (numPrecio <= 0) {
      toast({ variant: 'destructive', title: 'Precio inválido' });
      return;
    }
    if (miembros.length < 2) {
      toast({ variant: 'destructive', title: 'Agrega al menos 2 prendas', description: 'Un grupo de oferta necesita al menos 2 prendas para combinar.' });
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(firestore);
      let grupoId: string;

      if (editingGrupo) {
        grupoId = editingGrupo.id;
        const grupoRef = doc(firestore, 'gruposOferta', grupoId);
        batch.update(grupoRef, {
          nombre: nombre.trim(),
          cantidad: numCantidad,
          precio: numPrecio,
          miembros,
          updatedAt: serverTimestamp(),
        });

        // Prendas que estaban en el grupo y ya no están: se les quita la oferta.
        const miembrosActuales = new Set(miembros.map(m => `${m.pacaId}-${m.prendaId}`));
        (editingGrupo.miembros || []).forEach(m => {
          if (!miembrosActuales.has(`${m.pacaId}-${m.prendaId}`)) {
            const prendaRef = doc(firestore, 'pacas', m.pacaId, 'prendas', m.prendaId);
            batch.update(prendaRef, {
              grupoOfertaId: deleteField(),
              ofertaCantidad: deleteField(),
              ofertaPrecio: deleteField(),
            });
          }
        });
      } else {
        const grupoRef = doc(collection(firestore, 'gruposOferta'));
        grupoId = grupoRef.id;
        batch.set(grupoRef, {
          nombre: nombre.trim(),
          cantidad: numCantidad,
          precio: numPrecio,
          miembros,
          createdAt: serverTimestamp(),
        });
      }

      // Todas las prendas del grupo (nuevas y existentes) quedan con la oferta vigente.
      miembros.forEach(m => {
        const prendaRef = doc(firestore, 'pacas', m.pacaId, 'prendas', m.prendaId);
        batch.update(prendaRef, {
          grupoOfertaId: grupoId,
          ofertaCantidad: numCantidad,
          ofertaPrecio: numPrecio,
        });
      });

      await batch.commit();

      toast({ variant: 'success', title: editingGrupo ? 'Grupo actualizado' : 'Grupo creado' });
      setIsDialogOpen(false);
      resetForm();
      await fetchGrupos();
    } catch (error) {
      console.error('Error saving grupo de oferta:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el grupo de oferta.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGrupo = async () => {
    if (!firestore || !grupoToDelete) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(firestore);
      (grupoToDelete.miembros || []).forEach(m => {
        const prendaRef = doc(firestore, 'pacas', m.pacaId, 'prendas', m.prendaId);
        batch.update(prendaRef, {
          grupoOfertaId: deleteField(),
          ofertaCantidad: deleteField(),
          ofertaPrecio: deleteField(),
        });
      });
      batch.delete(doc(firestore, 'gruposOferta', grupoToDelete.id));
      await batch.commit();

      toast({ variant: 'success', title: 'Grupo eliminado', description: 'Las prendas volvieron a su precio normal.' });
      setGrupoToDelete(null);
      await fetchGrupos();
    } catch (error) {
      console.error('Error deleting grupo de oferta:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el grupo de oferta.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
            Ofertas
          </h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
            Promociones especiales y grupos de oferta entre prendas o pacas distintas.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="font-sans text-sm text-black" onClick={handleOpenCreate}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Grupo de Oferta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
            <DialogHeader>
              <DialogTitle>{editingGrupo ? 'Editar Grupo de Oferta' : 'Nuevo Grupo de Oferta'}</DialogTitle>
              <DialogDescription>
                Agrega prendas específicas (de cualquier paca) que compartirán la misma oferta "N por $X".
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh] -mx-6 px-6">
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="grupo-nombre">Nombre del Grupo</Label>
                  <Input
                    id="grupo-nombre"
                    placeholder='Ej: "Shorts de mezclilla 2x100"'
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={isSaving}
                    className="bg-white/80"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="grupo-cantidad">Prendas por paquete (N)</Label>
                    <Input
                      id="grupo-cantidad"
                      type="number"
                      min="2"
                      placeholder="Ej: 2"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={isSaving}
                      className="bg-white/80"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grupo-precio">Precio del paquete ($)</Label>
                    <Input
                      id="grupo-precio"
                      type="number"
                      min="0"
                      placeholder="Ej: 100"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={isSaving}
                      className="bg-white/80"
                    />
                  </div>
                </div>
                {Number(cantidad) > 0 && Number(precio) > 0 && (
                  <p className="text-sm font-semibold">Oferta: {cantidad} x ${Number(precio).toFixed(2)}</p>
                )}

                <div className="space-y-2 border-t pt-4">
                  <Label>Agregar prenda por ID</Label>
                  <form onSubmit={handleSearchPrenda} className="flex gap-2">
                    <Input
                      placeholder="ID de la prenda (ej: P1-3)"
                      value={searchId}
                      onChange={(e) => setSearchId(e.target.value)}
                      className="bg-white/80"
                      disabled={isSaving}
                    />
                    <Button type="submit" size="icon" variant="destructive" className="text-black" disabled={isSaving}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </form>
                </div>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base">Prendas en este grupo ({miembros.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {miembros.length > 0 ? (
                      <div className="space-y-2">
                        {miembros.map(m => (
                          <div key={`${m.pacaId}-${m.prendaId}`} className="flex justify-between items-center text-sm p-2 rounded-md bg-black/5">
                            <div>
                              <span className="font-semibold">{m.idPersonalizado}</span>
                              <span className="text-black/60"> — {m.tipoPrenda}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveMiembro(m.pacaId, m.prendaId)} disabled={isSaving}>
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-sm text-black/60">Aún no hay prendas en este grupo.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancelar</Button>
              <Button onClick={handleSaveGrupo} variant="destructive" className="text-black" disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar Grupo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <PromosEspecialesSection />

      <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
        <CardHeader>
          <CardTitle className="font-sans text-2xl text-black flex items-center gap-2">
            <Tags className="h-6 w-6" /> Lista de Grupos de Oferta
          </CardTitle>
          <CardDescription className="font-sans font-semibold text-md text-black">
            Por defecto, una oferta configurada en el inventario solo aplica entre prendas de la misma paca. Usa esta pantalla únicamente cuando quieras mezclar prendas de pacas distintas en la misma oferta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Oferta</TableHead>
                <TableHead>Prendas incluidas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">Cargando grupos de oferta...</TableCell></TableRow>
              ) : grupos.length > 0 ? (
                grupos.map(grupo => (
                  <TableRow key={grupo.id}>
                    <TableCell className="font-medium">{grupo.nombre}</TableCell>
                    <TableCell><Badge variant="secondary">{grupo.cantidad} x ${grupo.precio.toFixed(2)}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {(grupo.miembros || []).map(m => (
                          <Badge key={`${m.pacaId}-${m.prendaId}`} variant="outline" className="text-xs">{m.idPersonalizado}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(8px)' }}>
                          <DropdownMenuItem onClick={() => handleOpenEdit(grupo)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setGrupoToDelete(grupo)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay grupos de oferta configurados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!grupoToDelete} onOpenChange={(open) => { if (!open) setGrupoToDelete(null); }}>
        <AlertDialogContent className="font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este grupo de oferta?</AlertDialogTitle>
            <AlertDialogDescription>
              Las {grupoToDelete?.miembros?.length ?? 0} prenda(s) de este grupo dejarán de tener la oferta combinada y volverán a venderse a su precio normal. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>No, volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGrupo} disabled={isSaving} className="bg-red-600 text-white hover:bg-red-700">
              {isSaving ? 'Eliminando...' : 'Sí, eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
