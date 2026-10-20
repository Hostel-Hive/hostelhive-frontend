import { useEffect, useRef, useState } from 'react';

export default function PrivateStudentImage({
  blob,
  alt,
  qr = false,
  onError,
}: {
  blob: Blob;
  alt: string;
  qr?: boolean;
  onError: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const download = useRef<HTMLAnchorElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = image.current!;
    const link = download.current;
    const url = URL.createObjectURL(blob);
    element.src = url;
    if (link) link.href = url;
    return () => {
      element.removeAttribute('src');
      link?.removeAttribute('href');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <div className={qr ? 'portal-qr-image' : 'portal-photo'}>
      <img
        ref={image}
        alt={alt}
        width={qr ? 288 : 96}
        height={qr ? 288 : 96}
        onLoad={() => setLoaded(true)}
        onError={onError}
      />
      {!loaded && (
        <span role="status">Preparing {qr ? 'QR code' : 'photo'}…</span>
      )}
      {qr && (
        <a
          ref={download}
          download="hostelhive-student-qr.png"
          className="button-link"
          hidden={!loaded}
        >
          Download QR PNG
        </a>
      )}
    </div>
  );
}
