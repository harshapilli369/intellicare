import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setRole, setUserId } from "../../utils/userInfo";

function SignInPage() {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const onCreateProfile = () => {
    navigate("/signup");
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to sign in.");
        return;
      }

      setRole(result.user.role);
      setUserId(result.user.id);

      if (result.user.role === "admin") {
        navigate("/admin");
      } else if (result.user.role === "physician") {
        navigate("/physician");
      } else if (result.user.role === "patient") {
        navigate("/patient");
      } else {
        navigate("/404-error");
      }
    

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-blue-600">IntelliCare</h1>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Giving you back your time and energy, so you can focus on the
          things that matter
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-800 mb-1">
              Access Code
            </label>
            <input
              id="accessCode"
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Want to create a profile?{" "}
          <button
            type="button"
            onClick={onCreateProfile}
            className="text-blue-600 font-medium hover:underline focus:outline-none"
          >
            Click here
          </button>
        </p>
      </div>
    </div>
  );
}

export default SignInPage;
