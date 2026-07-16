export default function HawkAnimations() {
  return (
    <>
      {/* Subtle ambient glow - hidden on mobile */}
      <div className="fixed left-0 top-1/2 -translate-y-1/2 w-64 h-[600px] pointer-events-none z-0 bg-amber-900/5 blur-[100px] rounded-full hidden lg:block"></div>
      <div className="fixed right-0 top-1/2 -translate-y-1/2 w-64 h-[600px] pointer-events-none z-0 bg-blue-900/5 blur-[100px] rounded-full hidden lg:block"></div>
    </>
  );
}
