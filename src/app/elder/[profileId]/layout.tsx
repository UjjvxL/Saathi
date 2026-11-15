// Elderly mode has no site header or profile tabs: one calm screen with a single way back.
export default function ElderLayout({ children }: LayoutProps<"/elder/[profileId]">) {
  return (
    <main id="main" className="min-h-dvh bg-stone-50">
      {children}
    </main>
  );
}
