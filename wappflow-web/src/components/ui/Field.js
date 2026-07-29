'use client';

import { createContext, useContext, useId } from 'react';

// Field system — form PRIMITIVES (PROP-002 Batch D). One accessible field anatomy for
// the whole app: <Field> owns the label/required/error/hint wiring; Input/Textarea/
// Select are the controls; Checkbox and Switch cover the boolean patterns (3 duplicate
// page-local Toggles existed — Rule of Three).
//
//   <Field label="Phone Number" required error={errors.phone}>
//     <Input type="tel" value={v} onChange={...} placeholder="+92 300 1234567" />
//   </Field>
//
// Every control sets data-ui, which opts it OUT of the legacy global
// `input {…!important}` override (scoped down with :not([data-ui]) in globals.css) —
// so primitives style their own states while unmigrated inputs keep the old behavior
// byte-for-byte. Focus is pure CSS: the Batch A :focus-visible ring + an accent
// border on :focus. No JS focus handlers — the old per-input onFocus/onBlur
// borderColor handlers were provably dead (the !important beat inline styles).
//
// tone="public" renders the fixed light palette used by public token pages
// (booking/gallery/shop), which are light regardless of the app theme.

const FieldContext = createContext(null);

// Metrics match the app's dominant existing field anatomy (12px label / 14px control)
// so a migrated field sits flush beside an unmigrated one during the on-touch rollout.
// Flex (not block) so a label may carry a leading icon: label={<><User size={13}/> Name</>}.
const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 7,
};

export function Field({ label, required = false, error = null, hint = null, children, style }) {
  const uid = useId();
  const inputId = `${uid}-f`;
  const descId = error || hint ? `${uid}-d` : undefined;

  return (
    <FieldContext.Provider value={{ inputId, descId, required, invalid: !!error }}>
      <div style={style}>
        {label && (
          <label htmlFor={inputId} style={labelStyle}>
            {label}
            {required && <span aria-hidden="true" style={{ color: 'var(--danger-fg)', marginLeft: 3 }}>*</span>}
          </label>
        )}
        {children}
        {error ? (
          <p id={descId} role="alert" style={{ fontSize: 12, color: 'var(--danger-fg)', margin: '5px 0 0' }}>{error}</p>
        ) : hint ? (
          <p id={descId} style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '5px 0 0' }}>{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

// Shared aria/id wiring for a control sitting inside (or outside) a <Field>.
// Returns ONLY defined keys and is spread AFTER the caller's props: inside a <Field>
// the wiring must always win (a caller-supplied id would silently break the
// label↔input association), outside a <Field> nothing is forced.
function useControlProps({ tone, className = '', invalid }) {
  const field = useContext(FieldContext);
  const isInvalid = invalid ?? field?.invalid;
  const props = {
    'data-ui': true,
    className: `wf-input${tone === 'public' ? ' wf-input--public' : ''}${className ? ' ' + className : ''}`,
  };
  if (field?.inputId) props.id = field.inputId;
  if (field?.required) props['aria-required'] = 'true';
  if (isInvalid) props['aria-invalid'] = 'true';
  if (field?.descId) props['aria-describedby'] = field.descId;
  return props;
}

export function Input({ tone, className, invalid, ...rest }) {
  return <input {...rest} {...useControlProps({ tone, className, invalid })} />;
}

export function Textarea({ tone, className, invalid, rows = 3, ...rest }) {
  return <textarea rows={rows} {...rest} {...useControlProps({ tone, className, invalid })} />;
}

export function Select({ tone, className, invalid, children, ...rest }) {
  return <select {...rest} {...useControlProps({ tone, className, invalid })}>{children}</select>;
}

/**
 * Labeled checkbox — its own <label> is the click target, so it needs no <Field>.
 * It still adopts a surrounding Field's id/description when composed inside one,
 * otherwise that Field's <label htmlFor> would point at nothing.
 */
export function Checkbox({ label, checked, onChange, disabled = false, className = '', style, ...rest }) {
  const field = useContext(FieldContext);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, ...style }}>
      <input
        {...rest}
        type="checkbox"
        data-ui
        className={`wf-checkbox${className ? ' ' + className : ''}`}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        id={field?.inputId}
        aria-describedby={field?.descId}
      />
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * Switch — accessible toggle (role="switch"; a native button gives Space/Enter free).
 * `label` is the ACCESSIBLE NAME (aria-label), not visible text — render your own
 * text beside it, or wrap it in a <Field label="…"> which supplies the visible label.
 * Migration target for the page-local Toggles (team, studio settings, contracts
 * builder); those migrate on-touch, they are NOT rewritten by this batch.
 */
export function Switch({ checked = false, onChange, disabled = false, label, className, style, ...rest }) {
  const field = useContext(FieldContext);
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      id={field?.inputId}
      aria-describedby={field?.descId}
      className={className}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 'var(--radius-pill)', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: checked ? 'var(--accent)' : 'var(--border)',
        transition: 'background var(--dur)', position: 'relative', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
        ...style,
      }}
    >
      <span style={{
        position: 'absolute', width: 18, height: 18, background: 'var(--surface)', borderRadius: '50%',
        top: 3, left: checked ? 23 : 3, transition: 'left var(--dur)',
        boxShadow: 'var(--elev-1)',
      }} />
    </button>
  );
}
