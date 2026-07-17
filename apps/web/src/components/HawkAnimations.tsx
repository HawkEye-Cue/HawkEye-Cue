export default function HawkAnimations() {
  const hawkImage = '/hawk.jpg';

  return (
    <div className="fixed inset-0 pointer-events-none z-0 hidden lg:block">
      <img
        src={hawkImage}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{
          filter: 'brightness(0.15) contrast(1.1) saturate(0.5)',
          opacity: 0.6,
        }}
      />
    </div>
  );
}
