export default function HawkAnimations() {
  // Local hawk image - save your hawk photo to apps/web/public/hawk.jpg
  const hawkImage = '/hawk.jpg';

  return (
    <>
      {/* Left Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed left-0 top-0 bottom-0 pointer-events-none z-0 items-center hidden lg:flex">
        <div className="relative w-72 h-full overflow-hidden">
          <img
            src={hawkImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              filter: 'brightness(0.55) contrast(1.4) saturate(0.8)',
              maskImage: 'linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/15 to-transparent mix-blend-overlay"></div>
        </div>
      </div>

      {/* Right Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed right-0 top-0 bottom-0 pointer-events-none z-0 items-center hidden lg:flex">
        <div className="relative w-72 h-full overflow-hidden">
          <img
            src={hawkImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              filter: 'brightness(0.55) contrast(1.4) saturate(0.8)',
              transform: 'scaleX(-1)',
              maskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-amber-900/15 to-transparent mix-blend-overlay"></div>
        </div>
      </div>

      {/* Ambient glow - hidden on mobile */}
      <div className="fixed left-0 top-1/2 -translate-y-1/2 w-48 h-96 pointer-events-none z-0 bg-amber-700/5 blur-3xl rounded-full hidden lg:block"></div>
      <div className="fixed right-0 top-1/2 -translate-y-1/2 w-48 h-96 pointer-events-none z-0 bg-amber-700/5 blur-3xl rounded-full hidden lg:block"></div>
    </>
  );
}
