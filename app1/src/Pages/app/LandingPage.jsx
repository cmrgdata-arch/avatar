import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AppPages.css";

const LandingPage = () => {
  const { isAuthenticated, currentUser, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell app-landing container py-5">
      <div className="app-card p-5 mx-auto app-form-wrap text-center">
        <h1 className="app-title mb-2">Yoga Practice Portal</h1>
        <p className="app-subtitle mb-4">Real-time posture assistance and mindful movement</p>

        {isAuthenticated ? (
          <div className="d-flex flex-column align-items-center gap-3">
            <div className="alert alert-success w-100 py-3 mb-2">
              <span className="d-block text-muted small">Currently Signed In:</span>
              <strong className="fs-5">{currentUser?.full_name || currentUser?.email || "cmrg"}</strong>
            </div>

            <div className="d-flex flex-wrap justify-content-center gap-3 w-100">
              <Link to="/app/dashboard" className="btn btn-dark px-4 py-2">
                Continue to Practice Dashboard &rarr;
              </Link>
              <button
                type="button"
                className="btn btn-outline-danger px-4 py-2"
                onClick={() => {
                  logout();
                  navigate("/app/login");
                }}
              >
                Log Out / Switch Account
              </button>
            </div>
          </div>
        ) : (
          <div className="d-flex justify-content-center gap-3">
            <Link to="/app/login" className="btn btn-dark">
              Login
            </Link>
            <Link to="/app/signup" className="btn btn-outline-dark">
              Create Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default LandingPage;
