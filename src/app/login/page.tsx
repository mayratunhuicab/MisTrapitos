
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { Eye, EyeOff, User, Lock, Mail } from "lucide-react";
import { useAuth } from "@/firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // State for password reset dialog
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!auth) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "El servicio de autenticación no está disponible.",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Lógica simplificada: solo intentar iniciar sesión.
      // Se asume que el usuario ya existe y fue creado en la consola de Firebase.
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        variant: "success",
        title: "¡Bienvenido de nuevo!",
        description: "Has iniciado sesión correctamente.",
      });
      router.push("/dashboard");
    } catch (error: any) {
      // Si el inicio de sesión falla, es por credenciales incorrectas o porque el usuario no existe.
      console.error(error);
      toast({
        variant: "destructive",
        title: "Error de inicio de sesión",
        description: "Credenciales incorrectas.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth || !resetEmail) {
        toast({ variant: 'destructive', title: 'Correo requerido', description: 'Por favor, introduce tu correo electrónico.' });
        return;
    }
    setIsResetting(true);
    try {
        await sendPasswordResetEmail(auth, resetEmail);
        toast({
            variant: 'success',
            title: 'Enlace enviado',
            description: 'Se ha enviado un enlace para restablecer tu contraseña a tu correo electrónico.',
        });
        setIsResetDialogOpen(false);
        setResetEmail("");
    } catch (error: any) {
        console.error(error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo enviar el correo. Verifica que el correo electrónico sea correcto.',
        });
    } finally {
        setIsResetting(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen font-sans">
       {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mi-fondo.png"
        alt="Fondo personalizado para TrapitoStock"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50"></div>
      
      <div className="relative z-10 w-full max-w-sm mx-4">
        <Card style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.8)', backdropFilter: 'blur(8px)' }}>
          <form onSubmit={handleLogin}>
            <CardHeader className="text-center pt-6 pb-0">
              <div className="flex justify-center">
                <Link href="/" className="inline-block p-2 rounded-full">
                   <Image 
                    src="/logo.png" 
                    alt="Mis Trapitos Logo" 
                    width={150} 
                    height={150}
                    className="rounded-full"
                  />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-handwritten font-bold text-black text-lg">Correo Electrónico:</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder=""
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/70 border-zinc-300 dark:border-zinc-700 text-black pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="font-handwritten font-bold text-black text-lg">Contraseña:</Label>
                  <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <DialogTrigger asChild>
                         <Button variant="link" type="button" className="text-xs text-black/80 hover:text-black p-0 h-auto">
                            ¿Olvidaste tu contraseña?
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md font-sans" style={{ backgroundColor: 'hsla(39, 44%, 84%, 0.9)', backdropFilter: 'blur(12px)' }}>
                        <DialogHeader>
                            <DialogTitle>Restablecer Contraseña</DialogTitle>
                            <DialogDescription>
                                Introduce tu correo electrónico y te enviaremos un enlace para que puedas restablecer tu contraseña.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="reset-email" className="font-semibold">Correo Electrónico</Label>
                                <div className="relative">
                                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="reset-email"
                                        type="email"
                                        placeholder="tu@correo.com"
                                        required
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        disabled={isResetting}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                             <Button variant="outline" onClick={() => setIsResetDialogOpen(false)} disabled={isResetting}>Cancelar</Button>
                             <Button onClick={handlePasswordReset} disabled={isResetting} variant="destructive" className="text-black">
                                {isResetting ? 'Enviando...' : 'Enviar Enlace'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/70 border-zinc-300 dark:border-zinc-700 text-black pl-9"
                  />
                   <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" variant="destructive" className="w-full font-handwritten text-black font-bold text-xl" disabled={isLoading}>
                {isLoading ? "Iniciando..." : "Iniciar Sesión"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
    