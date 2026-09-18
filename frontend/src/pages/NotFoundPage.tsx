import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Sprout className="h-16 w-16 text-brand-200" />
      <h1 className="mt-4 text-4xl font-bold text-gray-300">404</h1>
      <p className="mt-2 text-gray-400">页面不存在或已被移走</p>
      <Link to="/" className="btn-primary mt-6">
        回到首页
      </Link>
    </div>
  );
}