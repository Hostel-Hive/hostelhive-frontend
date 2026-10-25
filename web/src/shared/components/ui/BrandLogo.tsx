/** Display the supplied artwork with its outer white margins clipped by CSS. */
export default function BrandLogo() {
  return (
    <span className="brand-logo">
      <img
        src={`${import.meta.env.BASE_URL}branding/hostelhive-logo-horizontal.png`}
        alt="HostelHive"
        width="1630"
        height="902"
        draggable={false}
      />
    </span>
  );
}
