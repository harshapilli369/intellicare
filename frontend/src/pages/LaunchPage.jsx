import React from "react";
import { useNavigate } from "react-router-dom";

import partners from "../assets/partners.json";

function LaunchPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-5xl font-extrabold text-blue-600 tracking-tight">
          IntelliCare
        </h1>

        <p className="mt-4 text-gray-600 text-base leading-relaxed">
          Giving you back your time and energy, so you can focus on the
          things that matter
        </p>

        <div className="navbar-buttons mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={() => navigate('/login')} id="sign-in" className="px-6 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            Sign In
          </button>
          <button type="button" onClick={() => navigate('/signup')} id="sign-up" className="px-6 py-2.5 rounded-md border border-gray-300 bg-white text-blue-600 text-sm font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            Get Started
          </button>
        </div>

        <div className="mt-16">
          <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">
            Can be used by:
          </p>

          <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 max-w-sm mx-auto text-left">
            {partners.map((partner) => (
              <li key={partner.name} className="flex items-center gap-2 text-sm text-gray-700">
                <a
                  href={partner.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2"
                >
                  <img
                    src={partner.logo}
                    alt={`${partner.name} logo`}
                    className="h-6 w-auto max-w-[5rem] object-contain"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LaunchPage;