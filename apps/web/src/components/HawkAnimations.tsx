export default function HawkAnimations() {
  const hawkImage = '/hawk.jpg';

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <img
        src={hawkImage}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        style={{
          filter: 'brightness(0.25) contrast(1.15) saturate(0.6)',
          opacity: 0.55,
        }}
      />
    </div>
  );
}
