
'use client';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useFirestore, useCollection, useUser, useMemoFirebase } from "@/firebase";
import { collection, doc, setDoc, deleteDoc, orderBy, query } from "firebase/firestore";
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Info } from "lucide-react";
import { useToast } from '@/hooks/use-toast';

type Role = {
  id: string; // This will be the user's UID
  email: string;
  role: "admin" | "empleado";
};

export default function UsersPage() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [userUid, setUserUid] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [userRole, setUserRole] = useState<"admin" | "empleado">("empleado");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Roles
    const rolesQuery = useMemoFirebase(() => {
        if (!firestore || !user || user.role !== 'admin') return null;
        return query(collection(firestore, 'roles_admin'), orderBy('email', 'asc'));
    }, [firestore, user]);

    const { data: roles, isLoading: isLoadingRoles } = useCollection<Role>(rolesQuery);
    
    const resetForm = () => {
        setSelectedRole(null);
        setUserUid("");
        setUserEmail("");
        setUserRole("empleado");
    }

    const handleOpenDialog = (role: Role | null = null) => {
        if (role) {
            setSelectedRole(role);
            setUserUid(role.id);
            setUserEmail(role.email);
            setUserRole(role.role);
        } else {
            resetForm();
        }
        setIsDialogOpen(true);
    }

    const handleSaveChanges = async () => {
        if (!firestore) return;
        if (!userUid || !userEmail || !userRole) {
            toast({ variant: "destructive", title: "Error", description: "Completa todos los campos." });
            return;
        }

        setIsSubmitting(true);
        const roleData = {
            email: userEmail,
            role: userRole,
        };

        try {
            const roleRef = doc(firestore, 'roles_admin', userUid);
            // Use setDoc to both create and update the role document.
            await setDoc(roleRef, roleData);
            
            toast({ variant: "success", title: "Rol guardado", description: `El usuario ${userEmail} ahora tiene el rol de ${userRole}.` });
            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving role:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar el rol." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDeleteRole = async (roleId: string) => {
        if (!firestore) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(firestore, 'roles_admin', roleId));
            toast({ variant: "success", title: "Rol eliminado", description: "El rol del usuario ha sido eliminado. Volverá a ser 'empleado' por defecto." });
        } catch (error) {
            console.error("Error deleting role:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el rol." });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
                        Gestión de Usuarios
                    </h1>
                    <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
                        Asigna roles a tus usuarios.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" className="font-sans text-sm text-black" onClick={() => handleOpenDialog()}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Asignar Rol
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                        <DialogHeader>
                            <DialogTitle>{selectedRole ? "Editar" : "Asignar"} Rol de Usuario</DialogTitle>
                            <DialogDescription>
                                {selectedRole ? "Edita el rol para este usuario." : "Asigna un rol a un usuario existente."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="uid" className="font-semibold">UID del Usuario</Label>
                                <Input id="uid" placeholder="Copia el UID de la consola de Firebase" value={userUid} onChange={(e) => setUserUid(e.target.value)} disabled={isSubmitting || !!selectedRole} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="email" className="font-semibold">Correo Electrónico</Label>
                                <Input id="email" type="email" placeholder="ejemplo@correo.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} disabled={isSubmitting} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role-select" className="font-sans font-semibold text-md text-black mb-1">Rol</Label>
                                <Select value={userRole} onValueChange={(value: "admin" | "empleado") => setUserRole(value)} disabled={isSubmitting}>
                                    <SelectTrigger id="role-select" className="font-sans bg-white/80">
                                        <SelectValue placeholder="Selecciona un rol" />
                                    </SelectTrigger>
                                    <SelectContent className="font-sans">
                                        <SelectItem value="empleado">Empleado</SelectItem>
                                        <SelectItem value="admin">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button onClick={handleSaveChanges} disabled={isSubmitting} variant="destructive" className="text-black">
                                {isSubmitting ? "Guardando..." : "Guardar Rol"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Alert className="bg-blue-100 border-blue-300 text-blue-800">
              <Info className="h-4 w-4 !text-blue-800" />
              <AlertTitle className="font-bold">¿Cómo crear un nuevo usuario?</AlertTitle>
              <AlertDescription>
                Por seguridad, la creación de cuentas de usuario se realiza desde la consola de Firebase.
                <ol className="list-decimal pl-5 mt-2">
                  <li>Ve a la sección <strong>Authentication</strong> de tu proyecto en Firebase.</li>
                  <li>Haz clic en <strong>Add user</strong> e introduce su email y contraseña.</li>
                  <li>Copia el <strong>User UID</strong> del nuevo usuario.</li>
                  <li>Vuelve aquí y haz clic en <strong>Asignar Rol</strong>, pegando el UID y asignando el rol correspondiente.</li>
                </ol>
              </AlertDescription>
            </Alert>

            <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
                <CardHeader>
                    <CardTitle className="font-sans text-2xl text-black">Roles de Usuario</CardTitle>
                    <CardDescription className="font-sans font-semibold text-md text-black">
                         Lista de usuarios con roles asignados.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="font-sans font-semibold text-sm text-black">Correo Electrónico</TableHead>
                                <TableHead className="font-sans font-semibold text-sm text-black">Rol</TableHead>
                                <TableHead className="text-right font-sans font-semibold text-sm text-black">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {isLoadingRoles ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center font-sans font-semibold text-lg text-black">
                                        Cargando roles...
                                    </TableCell>
                                </TableRow>
                            ) : roles && roles.length > 0 ? (
                                roles.map(role => (
                                    <TableRow key={role.id}>
                                        <TableCell className="font-medium">{role.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={role.role === 'admin' ? 'destructive' : 'secondary'}>
                                                {role.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="font-sans bg-white border-2 border-black">
                                                        <DropdownMenuItem onClick={() => handleOpenDialog(role)}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Editar Rol
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem className="text-red-500 focus:text-red-500">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar Rol
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                  <AlertDialogContent className="font-sans bg-white text-black">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Confirmar eliminación de rol?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no elimina la cuenta del usuario, solo quita su rol asignado. El usuario <span className="font-bold">{role.email}</span> pasará a tener el rol de 'empleado' por defecto en su próximo inicio de sesión.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteRole(role.id)} disabled={isSubmitting} className="bg-red-600 text-white hover:bg-red-700">
                                                            {isSubmitting ? "Eliminando..." : "Sí, eliminar rol"}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center font-sans font-semibold text-lg text-black">
                                        No hay roles asignados.
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
