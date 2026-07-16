export default function HawkAnimations() {
  const hawkImage = '/hawk.jpg';

  return (
    <>
      {/* Left Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed left-0 top-0 bottom-0 pointer-events-none z-0 items-center hidden lg:flex">
        <div className="relative w-96 h-full overflow-hidden">
          <img
            src={hawkImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              filter: 'brightness(0.35) contrast(1.2) saturate(0.7)',
              maskImage: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 40%, transparent 75%)',
              WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 40%, transparent 75%)',
            }}
          />
        </div>
      </div>

      {/* Right Hawk - hidden on mobile/tablet, only shows on wide screens */}
      <div className="fixed right-0 top-0 bottom-0 pointer-events-none z-0 items-center hidden lg:flex">
        <div className="relative w-96 h-full overflow-hidden">
          <img
            src={hawkImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              filter: 'brightness(0.35) contrast(1.2) saturate(0.7)',
              transform: 'scaleX(-1)',
              maskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 40%, transparent 75%)',
              WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 40%, transparent 75%)',
            }}
          />
        </div>
      </div>
    </>
  );
}
