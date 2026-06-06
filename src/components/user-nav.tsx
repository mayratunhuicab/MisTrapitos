
"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { useAuth, useUser } from "@/firebase"
import { signOut } from "firebase/auth"
import { useRouter } from "next/navigation"

export function UserNav() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    if (auth) {
      signOut(auth).then(() => {
        router.push('/login');
      });
    }
  };

  const getRoleDisplayName = () => {
    if (user?.role === 'admin') return 'Administrador';
    if (user?.role === 'empleado') return 'Empleado';
    return 'Usuario';
  }

  if (isUserLoading) {
    return (
      <div className="md:hidden flex flex-col items-center justify-center text-center w-full h-full p-1">
        <Avatar className="h-8 w-8 animate-pulse bg-gray-300">
          <AvatarFallback></AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium text-sidebar-foreground/80 mt-1">Perfil</span>
      </div>
    )
  }
  
  if (!user) {
     return (
       <Button variant="ghost" className="relative h-8 w-full justify-start gap-2" asChild>
          <Link href="/login">
            <Avatar className="h-8 w-8">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
             <div className="text-left hidden group-data-[collapsible=icon]:hidden">
               <p className="text-sm font-medium">Iniciar Sesión</p>
             </div>
          </Link>
        </Button>
     )
  }


  return (
    <>
      {/* Menú para Escritorio */}
      <div className="hidden md:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-full justify-start gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.photoURL || ""} alt={user.displayName || user.email || ''} className="object-contain" />
                <AvatarFallback>{user.email?.[0].toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden group-data-[collapsible=icon]:hidden">
                 <p className="text-sm font-medium">{user.displayName || getRoleDisplayName()}</p>
                 <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 font-sans" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.displayName || getRoleDisplayName()}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  Perfil
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Menú para Móvil */}
      <div className="md:hidden relative">
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex flex-col items-center justify-center text-center w-full h-full p-1 rounded-md hover:bg-sidebar-accent/50">
                 <Avatar className="h-8 w-8">
                  <AvatarImage src={user.photoURL || ""} alt={user.displayName || user.email || ''} className="object-contain" />
                  <AvatarFallback>{user.email?.[0].toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-sidebar-foreground/80 mt-1">Perfil</span>
              </button>
            </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 font-sans mb-2" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.displayName || getRoleDisplayName()}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  Perfil
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
