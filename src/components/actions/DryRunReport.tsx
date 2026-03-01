/**
 * DryRunReport — renders structured dry-run validation results
 *
 * Shows per-step checks with pass/fail/warn/skip indicators,
 * potential errors, warnings, and an aggregate summary.
 */

import React, { useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Info,
} from "lucide-react";
import type { DryRunJobResult, DryRunStepResult, DryRunCheck, CheckStatus } from "../../services/commands/dryRun";
import type { CommandError } from "../../services/commands/commandErrors";
import "../../styles/components/dry-run-report.css";

/* ─── Status helpers ─────────────────────────────────────────────────── */

const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle size={13} className="drr-icon drr-icon--pass" />,
  fail: <XCircle size={13} className="drr-icon drr-icon--fail" />,
  warn: <AlertTriangle size={13} className="drr-icon drr-icon--warn" />,
  skip: <SkipForward size={13} className="drr-icon drr-icon--skip" />,
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Warn",
  skip: "Skip",
};

/* ─── Sub-components ─────────────────────────────────────────────────── */

function CheckRow({ check }: { check: DryRunCheck }) {
  return (
    <div className={`drr-check drr-check--${check.status}`}>
      <div className="drr-check__status">{STATUS_ICON[check.status]}</div>
      <div className="drr-check__body">
        <div className="drr-check__label">{check.label}</div>
        <div className="drr-check__message">{check.message}</div>
        {check.detail && <div className="drr-check__detail">{check.detail}</div>}
      </div>
      <div className="drr-check__badge">{STATUS_LABEL[check.status]}</div>
    </div>
  );
}

function ErrorCard({ error }: { error: CommandError }) {
  return (
    <div className="drr-error">
      <div className="drr-error__message">{error.message}</div>
      <div className="drr-error__cause">{error.cause}</div>
    </div>
  );
}

function StepSection({ step }: { step: DryRunStepResult }) {
  const [expanded, setExpanded] = useState(true);
  const { result } = step;
  const failCount = result.checks.filter(c => c.status === "fail").length;
  const warnCount = result.checks.filter(c => c.status === "warn").length;

  return (
    <div className={`drr-step ${result.valid ? "drr-step--valid" : "drr-step--invalid"}`}>
      <button className="drr-step__header" onClick={() => setExpanded(!expanded)}>
        <span className="drr-step__chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="drr-step__status-dot">{result.valid ? STATUS_ICON.pass : STATUS_ICON.fail}</span>
        <span className="drr-step__name">
          {step.stepName || `Step ${step.stepIndex + 1}`}
        </span>
        <code className="drr-step__cmd">/{step.commandId}</code>
        {step.conditionMet === false && (
          <span className="drr-step__condition-badge">Condition: skip</span>
        )}
        <span className="drr-step__counts">
          {failCount > 0 && <span className="drr-count drr-count--fail">{failCount} fail</span>}
          {warnCount > 0 && <span className="drr-count drr-count--warn">{warnCount} warn</span>}
        </span>
      </button>

      {expanded && (
        <div className="drr-step__body">
          {result.checks.map((check, i) => (
            <CheckRow key={i} check={check} />
          ))}

          {result.potentialErrors.length > 0 && (
            <div className="drr-step__errors">
              <div className="drr-section-label">
                <AlertTriangle size={12} /> Known failure modes
              </div>
              {result.potentialErrors.map((err, i) => (
                <ErrorCard key={i} error={err} />
              ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="drr-step__warnings">
              <div className="drr-section-label">
                <Info size={12} /> Warnings
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="drr-warning">{w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────── */

interface DryRunReportProps {
  report: DryRunJobResult;
  onClose?: () => void;
  onRunForReal?: () => void;
}

export function DryRunReport({ report, onClose, onRunForReal }: DryRunReportProps) {
  return (
    <div className="drr">
      {/* Header */}
      <div className={`drr__header ${report.valid ? "drr__header--pass" : "drr__header--fail"}`}>
        <FlaskConical size={18} className="drr__header-icon" />
        <div className="drr__header-text">
          <h3 className="drr__title">Dry Run Report</h3>
          <p className="drr__summary">{report.summary}</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="drr__stats">
        <div className="drr-stat drr-stat--pass">
          <CheckCircle size={12} /> {report.passedChecks} passed
        </div>
        <div className="drr-stat drr-stat--fail">
          <XCircle size={12} /> {report.failedChecks} failed
        </div>
        <div className="drr-stat drr-stat--warn">
          <AlertTriangle size={12} /> {report.warningCount} warnings
        </div>
        <div className="drr-stat drr-stat--total">
          {report.totalChecks} total checks
        </div>
      </div>

      {/* Unresolved refs */}
      {report.unresolvedRefs.length > 0 && (
        <div className="drr__refs">
          <div className="drr-section-label">
            <AlertTriangle size={12} /> Unresolved References
          </div>
          <div className="drr__refs-list">
            {report.unresolvedRefs.map((ref, i) => (
              <code key={i} className="drr__ref">{ref}</code>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="drr__steps">
        {report.steps.map((step) => (
          <StepSection key={step.stepId} step={step} />
        ))}
      </div>

      {/* Footer */}
      <div className="drr__footer">
        {onClose && (
          <button className="drr__btn drr__btn--secondary" onClick={onClose}>
            Close
          </button>
        )}
        {onRunForReal && report.valid && (
          <button className="drr__btn drr__btn--primary" onClick={onRunForReal}>
            Run for Real
          </button>
        )}
      </div>
    </div>
  );
}
