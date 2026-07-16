export default function HawkAnimations() {
  const hawkImage = '/hawk.jpg';

  return (
    <>
      {/* Left Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed left-0 top-0 bottom-0 w-[50vw] pointer-events-none z-0 hidden lg:block overflow-hidden">
        <img
          src={hawkImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{
            filter: 'brightness(0.3) contrast(1.2) saturate(0.6)',
            maskImage: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)',
          }}
        />
      </div>

      {/* Right Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed right-0 top-0 bottom-0 w-[50vw] pointer-events-none z-0 hidden lg:block overflow-hidden">
        <img
          src={hawkImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{
            filter: 'brightness(0.3) contrast(1.2) saturate(0.6)',
            transform: 'scaleX(-1)',
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 30%, transparent 60%)',
          }}
        />
      </div>
    </>
  );
}
