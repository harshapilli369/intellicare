import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setRole, setUserId } from "../../utils/userInfo";

function SignUp() {
  const [organizationName, setOrganizationName] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userLastName, setUserLastName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    const nextErrors = {};

    if (!organizationName.trim()) {
      nextErrors.organizationName = "Organization name is required";
    }

    if (!userFirstName.trim()) {
      nextErrors.userFirstName = "First name is required";
    }

    if (!userLastName.trim()) {
      nextErrors.userLastName = "Last name is required";
    }

    if (!userEmail.includes("@")) {
      nextErrors.userEmail = "Please enter a valid email";
    }

    if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          userFullName: `${userFirstName.trim()} ${userLastName.trim()}`,
          userEmail,
          password,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setSubmitError(result.error || "Unable to create account.");
        return;
      }

      setRole(result.user.role || "admin");
      setUserId(result.user.id);
      navigate("/signin");
    } catch (err) {
      console.error(err);
      setSubmitError("Unable to reach the server. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
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
            <label htmlFor="orgName" className="block text-xs font-semibold text-gray-800 mb-1">
              Organization Name
            </label>
            <input
              id="orgName"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.organizationName && (
              <p className="mt-1 text-xs text-red-600">{errors.organizationName}</p>
            )}
          </div>

          <div>
            <label htmlFor="userFirstName" className="block text-xs font-semibold text-gray-800 mb-1">
              User First Name
            </label>
            <input
              id="userFirstName"
              type="text"
              value={userFirstName}
              onChange={(e) => setUserFirstName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.userFirstName && (
              <p className="mt-1 text-xs text-red-600">{errors.userFirstName}</p>
            )}
          </div>

          <div>
            <label htmlFor="userLastName" className="block text-xs font-semibold text-gray-800 mb-1">
              User Last Name
            </label>
            <input
              id="userLastName"
              type="text"
              value={userLastName}
              onChange={(e) => setUserLastName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.userLastName && (
              <p className="mt-1 text-xs text-red-600">{errors.userLastName}</p>
            )}
          </div>

          <div>
            <label htmlFor="userEmail" className="block text-xs font-semibold text-gray-800 mb-1">
              User email
            </label>
            <input
              id="userEmail"
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.userEmail && (
              <p className="mt-1 text-xs text-red-600">{errors.userEmail}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-800 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-gray-800 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
            )}
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Already with us?{" "}
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="text-blue-600 font-medium hover:underline focus:outline-none"
          >
            Click here
          </button>
        </p>
      </div>
    </div>
  );
}

export default SignUp;
