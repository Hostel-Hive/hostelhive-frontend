/** Display the supplied artwork with its outer white margins clipped by CSS. */
export default function BrandLogo() {
  return (
    <span className="brand-logo">
      <img
        src={`${import.meta.env.BASE_URL}branding/hostelhive-logo.png`}
        alt="HostelHive"
        width="1600"
        height="1600"
        draggable={false}
      />
    </span>
  );
}
