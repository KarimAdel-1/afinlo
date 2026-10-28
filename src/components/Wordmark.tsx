import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/core/brand";

/** Afinlo's logo, leading home. */
export function Wordmark() {
  return (
    <Link href="/" className="inline-flex shrink-0 items-center" aria-label={`${BRAND.name} home`}>
      <Image src="/brand/afinlo-logo.png" alt={BRAND.name} width={2103} height={748} className="h-11 w-auto" priority />
    </Link>
  );
}
