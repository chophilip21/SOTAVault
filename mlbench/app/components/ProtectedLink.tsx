'use client';

import { useAuth } from "@/lib/authContext";
import { requiresAuth } from "@/lib/routeAccess";
import Link from "next/link";
import { ReactNode, MouseEvent } from "react";

interface ProtectedLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onLoginRequired?: () => void;
  onClick?: () => void;
}

export default function ProtectedLink({
  href,
  children,
  className = '',
  onLoginRequired,
  onClick
}: ProtectedLinkProps) {
  const { user } = useAuth();
  const routeRequiresAuth = requiresAuth(href);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (routeRequiresAuth && !user) {
      e.preventDefault();
      if (onLoginRequired) {
        onLoginRequired();
      }
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

