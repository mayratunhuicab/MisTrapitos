import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        <section className="relative h-screen w-full flex items-center justify-center text-center">
          {/* Antes: <img> normal cargaba un PNG de ~916 KB sin comprimir en cada visita.
              Ahora: next/image sirve una versión WebP ya comprimida (~40 KB) y la ajusta
              automáticamente al tamaño de pantalla de cada visitante. */}
          <Image
            src="/mi-fondo.webp"
            alt="Fondo personalizado para TrapitoStock"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative z-10 flex flex-col items-center max-w-4xl mx-auto px-4 -mt-16">
            <div className="mb-4">
              <Image 
                src="/logo.png" 
                alt="Mis Trapitos Logo" 
                width={80} 
                height={80}
                className="rounded-full"
              />
            </div>
            <h2 className="text-5xl md:text-7xl font-bold font-title text-white [text-shadow:_-2px_-2px_0_rgba(0,0,0,0.8),_2px_-2px_0_rgba(0,0,0,0.8),_-2px_2px_0_rgba(0,0,0,0.8),_2px_2px_0_rgba(0,0,0,0.8)]">
              Mis Trapitos
            </h2>
            <p className="mt-4 text-lg md:text-xl text-white max-w-2xl leading-relaxed font-handwritten font-bold [text-shadow:_-1px_-1px_0_rgba(0,0,0,0.9),_1px_-1px_0_rgba(0,0,0,0.9),_-1px_1px_0_rgba(0,0,0,0.9),_1px_1px_0_rgba(0,0,0,0.9)]">
              ¡Bienvenido a Mis Trapitos! Controla tu inventario, ventas y reportes de tu tienda de ropa de manera rápida y sencilla. ¡Tu negocio siempre bajo control!
            </p>
            <Button asChild size="lg" variant="destructive" className="mt-8 group text-black font-handwritten font-bold text-xl">
              <Link href="/login">
                Empezar ahora <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
