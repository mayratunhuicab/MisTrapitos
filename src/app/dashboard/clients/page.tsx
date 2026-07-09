
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFirestore, useCollection, useUser, useMemoFirebase } from "@/firebase";
import { collection, query, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from "firebase/firestore";
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Phone } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type Cliente = {
  id: string;
  nombre: string;
  telefono: string;
  notas: string;
  createdAt: { seconds: number; nanoseconds: number; } | Date;
};

// Helper function to convert to Title Case
const toTitleCase = (str: string) => {
    if (!str) return str;
    return str.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  };

export default function ClientsPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
    const [nombreCliente, setNombreCliente] = useState("");
    const [telefonoCliente, setTelefonoCliente] = useState("");
    const [notasCliente, setNotasCliente] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Clientes
    const clientesQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return query(collection(firestore, 'clientes'), orderBy('createdAt', 'desc'));
    }, [firestore, user]);

    const { data: clientes, isLoading: isLoadingClientes } = useCollection<Cliente>(clientesQuery);
    
    const resetForm = () => {
        setSelectedCliente(null);
        setNombreCliente("");
        setTelefonoCliente("");
        setNotasCliente("");
    }

    const handleOpenDialog = (cliente: Cliente | null = null) => {
        if (cliente) {
            setSelectedCliente(cliente);
            setNombreCliente(cliente.nombre);
            setTelefonoCliente(cliente.telefono);
            setNotasCliente(cliente.notas);
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    }

    const handleSaveChanges = async () => {
        if (!firestore) return;
        if (!nombreCliente || !telefonoCliente) {
            toast({ variant: "destructive", title: "Error", description: "El nombre y el teléfono del cliente son obligatorios." });
            return;
        }

        setIsSubmitting(true);
        const clienteData = {
            nombre: toTitleCase(nombreCliente),
            telefono: telefonoCliente,
            notas: notasCliente,
        };

        try {
            if (selectedCliente) {
                const clienteRef = doc(firestore, 'clientes', selectedCliente.id);
                await updateDoc(clienteRef, clienteData);
                toast({ variant: "success", title: "Cliente actualizado" });
            } else {
                await addDoc(collection(firestore, 'clientes'), {
                    ...clienteData,
                    createdAt: serverTimestamp()
                });
                toast({ variant: "success", title: "Cliente agregado" });
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving client:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el cliente." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDeleteCliente = async (clienteId: string) => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(firestore, 'clientes', clienteId));
            toast({ variant: "success", title: "Cliente eliminado" });
        } catch (error) {
            console.error("Error deleting client:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el cliente." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const getClienteDate = (cliente: Cliente) => {
        const date = cliente.createdAt && 'seconds' in cliente.createdAt
          ? new Date(cliente.createdAt.seconds * 1000)
          : cliente.createdAt as Date;
        return date ? format(date, "dd/MM/yyyy", { locale: es }) : 'N/A';
    };
    

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
                        Gestión de Clientes
                    </h1>
                    <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                        Agrega y consulta la información de tus clientes.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" className="font-sans text-sm text-black" onClick={() => handleOpenDialog()}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Agregar Cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                        <DialogHeader>
                            <DialogTitle>{selectedCliente ? "Editar" : "Agregar"} Cliente</DialogTitle>
                            <DialogDescription>
                                {selectedCliente ? "Edita la información de este cliente." : "Registra un nuevo cliente para notificarle sobre nuevas prendas."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="nombre" className="font-semibold">Nombre del Cliente</Label>
                                <Input id="nombre" placeholder="" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="telefono" className="font-semibold">Teléfono / WhatsApp</Label>
                                <Input id="telefono" type="tel" placeholder="" value={telefonoCliente} onChange={(e) => setTelefonoCliente(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notas" className="font-semibold">Notas (Prendas de interés)</Label>
                                <Textarea id="notas" placeholder="" value={notasCliente} onChange={(e) => setNotasCliente(e.target.value)} disabled={isSubmitting} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button onClick={handleSaveChanges} disabled={isSubmitting} variant="destructive" className="text-black">
                                {isSubmitting ? "Guardando..." : "Guardar Cliente"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
                <CardHeader>
                    <CardTitle className="font-sans text-2xl text-black">Lista de Clientes</CardTitle>
                    <CardDescription className="font-sans font-semibold text-md text-black">
                         Aquí puedes ver todos tus clientes registrados.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="font-sans font-semibold text-sm text-black">Nombre</TableHead>
                                <TableHead className="font-sans font-semibold text-sm text-black">Teléfono</TableHead>
                                <TableHead className="hidden md:table-cell font-sans font-semibold text-sm text-black">Notas</TableHead>
                                <TableHead className="hidden sm:table-cell font-sans font-semibold text-sm text-black">Fecha de Registro</TableHead>
                                <TableHead className="text-right font-sans font-semibold text-sm text-black">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {isLoadingClientes ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center font-sans font-semibold text-lg text-black">
                                        Cargando clientes...
                                    </TableCell>
                                </TableRow>
                            ) : clientes && clientes.length > 0 ? (
                                clientes.map(cliente => (
                                    <TableRow key={cliente.id}>
                                        <TableCell className="font-medium">{cliente.nombre}</TableCell>
                                        <TableCell>
                                            <a href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                                <Phone className="h-4 w-4" /> {cliente.telefono}
                                            </a>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell max-w-sm truncate">{cliente.notas || 'Sin notas'}</TableCell>
                                        <TableCell className="hidden sm:table-cell">{getClienteDate(cliente)}</TableCell>
                                        <TableCell className="text-right">
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black">
                                                        <DropdownMenuItem onClick={() => handleOpenDialog(cliente)}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem className="text-red-500 focus:text-red-500">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <AlertDialogContent className="font-sans bg-white text-black">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Se eliminará el cliente: <span className="font-bold">{cliente.nombre}</span>.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteCliente(cliente.id)} disabled={isSubmitting} className="bg-red-600 text-white hover:bg-red-700">
                                                            {isSubmitting ? "Eliminando..." : "Sí, eliminar"}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center font-sans font-semibold text-lg text-black">
                                        No hay clientes registrados.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
