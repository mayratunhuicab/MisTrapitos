
'use client';

import Link from 'next/link';
import { useUser, useAuth, useStorage } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, User as UserIcon, Camera } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useRef } from 'react';
import { updateProfile } from 'firebase/auth';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const storage = useStorage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleIconClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !auth?.currentUser || !storage) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({
            variant: "destructive",
            title: "Archivo muy grande",
            description: "Por favor, elige una imagen de menos de 2MB.",
        });
        return;
    }

    setIsUploading(true);
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        try {
            const dataUrl = reader.result as string;
            const sRef = storageRef(storage, `profile-pictures/${user.uid}`);
            
            // Upload the new image
            await uploadString(sRef, dataUrl, 'data_url');
            
            // Get the public URL
            const photoURL = await getDownloadURL(sRef);

            // Update the user's profile
            await updateProfile(auth.currentUser!, { photoURL });

            toast({
                variant: "success",
                title: "¡Foto de perfil actualizada!",
                description: "Tu nueva foto de perfil está visible.",
            });

            // The onAuthStateChanged listener in FirebaseProvider will handle the UI update automatically.
            // For an immediate refresh without a full reload, you could manually update a local user state if you had one.
            // But for simplicity, we let the provider handle it. A hard refresh is a simple way to see the change.
             window.location.reload();


        } catch (error) {
            console.error("Error updating profile picture:", error);
            toast({
                variant: "destructive",
                title: "Error al actualizar la foto",
                description: "No se pudo cambiar tu foto de perfil. Inténtalo de nuevo.",
            });
        } finally {
            setIsUploading(false);
        }
    };
    reader.onerror = (error) => {
        console.error("Error reading file:", error);
        toast({
            variant: "destructive",
            title: "Error de archivo",
            description: "No se pudo leer el archivo de imagen.",
        });
        setIsUploading(false);
    };
  };
  
  const getRoleName = (role: string | null | undefined) => {
    if (role === 'admin') return 'Administrador';
    if (role === 'empleado') return 'Empleado';
    return 'No asignado';
  };

  const roleName = getRoleName(user?.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="destructive" size="icon" className="h-8 w-8 text-black flex-shrink-0">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Volver al Panel</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
            Perfil de Usuario
          </h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
            Aquí puedes ver la información de tu cuenta.
          </p>
        </div>
      </div>

      <Card
        className="max-w-md mx-auto"
        style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}
      >
        <CardHeader className="items-center text-center">
          {isUserLoading ? (
            <Skeleton className="h-24 w-24 rounded-full" />
          ) : (
            <div className="relative group">
                <Avatar className="h-24 w-24 border-4 border-white shadow-lg">
                  <AvatarImage src={user?.photoURL || ''} alt={user?.displayName || ''} className="object-contain" />
                  <AvatarFallback className="text-3xl bg-gray-200 text-black">
                    {user?.email?.[0].toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg" className="hidden"/>
                <div 
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={handleIconClick}
                >
                    <Camera className="h-8 w-8 text-white" />
                </div>
                 {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full">
                        <div className="h-6 w-6 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
                    </div>
                 )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isUserLoading ? (
            <>
              <Skeleton className="h-6 w-3/4 mx-auto" />
              <Skeleton className="h-5 w-1/2 mx-auto" />
            </>
          ) : user ? (
            <div className="text-center">
              <CardTitle className="font-sans text-2xl text-black">{user.displayName || roleName}</CardTitle>
              <CardDescription className="font-sans font-semibold text-md text-black/80">{user.email}</CardDescription>
            </div>
          ) : (
            <p className="text-center font-sans font-semibold text-black">No se pudo cargar la información del usuario.</p>
          )}

          <div className="space-y-3 pt-4">
             <div className="flex items-center gap-3">
                <UserIcon className="h-5 w-5 text-black/70" />
                <span className="font-sans text-sm text-black">
                    Rol: {roleName}
                </span>
             </div>
             <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-black/70" />
                <span className="font-sans text-sm text-black">
                    Correo: {user?.email}
                </span>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
