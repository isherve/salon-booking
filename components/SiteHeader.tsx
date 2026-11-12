import Link from "next/link";

export default function SiteHeader({ name }: { name: string }) {
  const [first, ...rest] = name.split(" ");
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="brand">
          {first} <span>{rest.join(" ")}</span>
        </Link>
        <Link href="/book" className="btn sm">Book now</Link>
      </div>
    </header>
  );
}
