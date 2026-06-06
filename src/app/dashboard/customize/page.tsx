'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useFirestore, useDoc, useUser, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type AppConfig = {
  isTallaEnabled?: boolean;
};

export default function CustomizePage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const configDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'app_config', 'settings');
  }, [firestore, user]);

  const { data: config, isLoading: isConfigLoading } = useDoc<AppConfig>(configDocRef);

  // Default to true if the setting doesn't exist yet, so the default experience is unchanged.
  const isTallaEnabled = config?.isTallaEnabled ?? true; 

  const handleTallaToggle = (enabled: boolean) => {
    if (!configDocRef) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la configuración. Intenta de nuevo.",
      });
      return;
    }
    
    const configData = { isTallaEnabled: enabled };
    
    // Use setDoc with merge to create or update the document, with non-blocking error handling.
    setDoc(configDocRef, configData, { merge: true })
      .then(() => {
        toast({
          variant: "success",
          title: "Configuración Guardada",
          description: `El campo 'Talla' para prendas ha sido ${enabled ? 'habilitado' : 'deshabilitado'}.`,
        });
      })
      .catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: configDocRef.path,
          operation: 'write',
          requestResourceData: configData,
        });

        // Emit the error with the global error emitter to be caught by the error boundary.
        errorEmitter.emit('permission-error', permissionError);
      });
  };


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
            Personalización
          </h1>
          <p className="text-xl text-white font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
            Modifica la apariencia y configuración de tu aplicación.
          </p>
        </div>
      </div>

      <Card
        className="max-w-2xl mx-auto"
        style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}
      >
        <CardHeader>
          <CardTitle className="font-sans text-2xl text-black">Configuración de Campos</CardTitle>
          <CardDescription className="font-sans font-semibold text-md text-black/80">
            Habilita o deshabilita campos en los formularios para agilizar tu flujo de trabajo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConfigLoading ? (
             <div className="flex items-center justify-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-black" />
             </div>
          ) : (
            <div className="flex items-center space-x-4 rounded-md border-2 border-black/20 p-4">
              <div className="flex-1 space-y-1">
                <Label htmlFor="talla-mode" className="text-base font-bold text-black">
                  Campo de Talla en Prendas
                </Label>
                <p className="text-sm text-black/80">
                  {isTallaEnabled
                    ? "Habilitado. Se pedirá la talla al registrar una prenda."
                    : "Deshabilitado. Se asignará 'Única' por defecto para agilizar el registro."}
                </p>
              </div>
              <Switch
                id="talla-mode"
                checked={isTallaEnabled}
                onCheckedChange={handleTallaToggle}
                aria-label="Activar o desactivar campo de talla"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
