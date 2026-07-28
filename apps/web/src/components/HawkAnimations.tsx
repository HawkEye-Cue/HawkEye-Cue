export default function HawkAnimations() {
  const hawkImage = '/hawk.jpg';

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <img
        src={hawkImage}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{
          filter: 'brightness(0.4) contrast(1.2) saturate(0.7)',
          opacity: 0.7,
        }}
      />
    </div>
  );
}
