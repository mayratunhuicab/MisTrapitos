import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from '@/firebase';
import { Outfit, Indie_Flower, Holtwood_One_SC } from 'next/font/google';

// Antes: un <link> a Google Fonts cargaba 7 familias completas (varias con casi todos
// los pesos de 100 a 900), incluyendo 4 que no se usan en ninguna parte visible del
// código (Bricolage Grotesque, Gluten, Plus Jakarta Sans y "Playpen Sans Deva" —
// la clase font-welcome que la usaba no aparece en ninguna pantalla). Eso era una
// petición de red extra y bloqueante en cada carga de página, para fuentes que ni
// siquiera se ven. Ahora: next/font/google auto-hospeda solo las 3 familias que sí
// se usan, con solo los pesos necesarios, sin ida y vuelta a Google en cada visita.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

const indieFlower = Indie_Flower({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-indie-flower',
  display: 'swap',
});

const holtwoodOneSC = Holtwood_One_SC({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-holtwood-one-sc',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mis Trapitos',
  description: 'Controla tu inventario, ventas y reportes de tu tienda de ropa.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${outfit.variable} ${indieFlower.variable} ${holtwoodOneSC.variable}`}
    >
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          {children}
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
