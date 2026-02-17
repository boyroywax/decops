import React, { Component, ErrorInfo, ReactNode } from "react";
import "../../styles/components/error-boundary.css";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="error-boundary">
                    <h3 className="error-boundary__title">Something went wrong.</h3>
                    <details className="error-boundary__details">
                        {this.state.error?.toString()}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}
