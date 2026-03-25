import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";

import useConfirmationDialog from "../components/useConfirmationDialog";
import { auth } from "../firebase";
import { createUserLogType, getTracker } from "../services/firestore";

const AVAILABLE_FIELD_TYPES = [
    {
        value: "text",
        label: "Text",
        description: "Short freeform text such as a product, place, or note.",
        placeholder: "Enter a response"
    },
    {
        value: "date",
        label: "Date",
        description: "A calendar date for when something happened.",
        placeholder: ""
    },
    {
        value: "time",
        label: "Time",
        description: "A clock time for when the event occurred.",
        placeholder: ""
    },
    {
        value: "checkbox",
        label: "Checkbox",
        description: "A yes or no toggle for completion or confirmation.",
        placeholder: ""
    }
];

const DEFAULT_RETURN_PATH = "/";

const createFieldDraft = (type) => {
    const fieldType = AVAILABLE_FIELD_TYPES.find((option) => option.value === type) || AVAILABLE_FIELD_TYPES[0];

    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: `${fieldType.label} field`,
        type: fieldType.value,
        required: false,
        placeholder: fieldType.placeholder
    };
};

const moveField = (fields, sourceId, destinationId) => {
    const sourceIndex = fields.findIndex((field) => field.id === sourceId);
    const destinationIndex = fields.findIndex((field) => field.id === destinationId);

    if (sourceIndex === -1 || destinationIndex === -1 || sourceIndex === destinationIndex) {
        return fields;
    }

    const nextFields = [...fields];
    const [movedField] = nextFields.splice(sourceIndex, 1);

    nextFields.splice(destinationIndex, 0, movedField);

    return nextFields;
};

const formatFieldTypeLabel = (type) => {
    return AVAILABLE_FIELD_TYPES.find((option) => option.value === type)?.label || type;
};

const previewValueByType = {
    text: "Sample response",
    date: "",
    time: "",
    checkbox: true
};

const LogTypeBuilder = () => {
    const { trackerId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [userId, setUserId] = useState(null);
    const [authResolved, setAuthResolved] = useState(false);
    const [trackerName, setTrackerName] = useState("");
    const [isLoadingTracker, setIsLoadingTracker] = useState(Boolean(trackerId));
    const [draftName, setDraftName] = useState("");
    const [fields, setFields] = useState([]);
    const [activeFieldId, setActiveFieldId] = useState("");
    const [draggedFieldId, setDraggedFieldId] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const { confirm, confirmationDialog } = useConfirmationDialog();

    const returnTo = location.state?.returnTo || (trackerId ? `/trackers/${trackerId}` : DEFAULT_RETURN_PATH);
    const hasUnsavedChanges = !isSaving && (draftName.trim() !== "" || fields.length > 0);
    const navigationBlocker = useBlocker(hasUnsavedChanges);
    const blockerRef = useRef(navigationBlocker);
    const isConfirmingNavigationRef = useRef(false);

    blockerRef.current = navigationBlocker;

    useBeforeUnload((event) => {
        if (!hasUnsavedChanges) {
            return;
        }

        event.preventDefault();
        event.returnValue = "";
    });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUserId(user?.uid || null);
            setAuthResolved(true);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!trackerId) {
            setIsLoadingTracker(false);
            setTrackerName("");
            return;
        }

        let isMounted = true;

        const loadTracker = async () => {
            setIsLoadingTracker(true);

            try {
                const tracker = await getTracker(trackerId);

                if (!isMounted) {
                    return;
                }

                setTrackerName(tracker?.name || "Tracker");
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message || "Unable to load the tracker context.");
                }
            } finally {
                if (isMounted) {
                    setIsLoadingTracker(false);
                }
            }
        };

        loadTracker();

        return () => {
            isMounted = false;
        };
    }, [trackerId]);

    useEffect(() => {
        if (navigationBlocker.state !== "blocked" || isConfirmingNavigationRef.current) {
            return;
        }

        let isMounted = true;
        isConfirmingNavigationRef.current = true;

        confirm({
            title: "Discard unsaved changes?",
            message: "You have unsaved changes in this log type builder. Leave this page and discard them?",
            confirmLabel: "Leave page",
            cancelLabel: "Stay here",
            variant: "danger"
        }).then((shouldLeave) => {
            if (!isMounted) {
                return;
            }

            isConfirmingNavigationRef.current = false;

            if (shouldLeave) {
                blockerRef.current.proceed();
                return;
            }

            blockerRef.current.reset();
        });

        return () => {
            isMounted = false;
            if (navigationBlocker.state !== "blocked") {
                isConfirmingNavigationRef.current = false;
            }
        };
    }, [confirm, navigationBlocker.state]);

    const activeField = useMemo(() => {
        return fields.find((field) => field.id === activeFieldId) || null;
    }, [activeFieldId, fields]);

    const addField = (type) => {
        const nextField = createFieldDraft(type);

        setFields((currentFields) => [...currentFields, nextField]);
        setActiveFieldId(nextField.id);
        setError("");
    };

    const updateField = (fieldId, updates) => {
        setFields((currentFields) =>
            currentFields.map((field) =>
                field.id === fieldId
                    ? { ...field, ...updates }
                    : field
            )
        );
    };

    const removeField = (fieldId) => {
        setFields((currentFields) => {
            const nextFields = currentFields.filter((field) => field.id !== fieldId);

            if (activeFieldId === fieldId) {
                setActiveFieldId(nextFields[0]?.id || "");
            }

            return nextFields;
        });
    };

    const handleDragStart = (fieldId) => {
        setDraggedFieldId(fieldId);
    };

    const handleDrop = (targetFieldId) => {
        if (!draggedFieldId) {
            return;
        }

        setFields((currentFields) => moveField(currentFields, draggedFieldId, targetFieldId));
        setDraggedFieldId("");
    };

    const handleSave = async (event) => {
        event.preventDefault();

        if (!userId) {
            setError("You must be signed in to create a log type.");
            return;
        }

        const trimmedName = draftName.trim();
        const normalizedFields = fields
            .map((field) => ({
                id: field.id,
                label: field.label.trim(),
                type: field.type,
                required: field.required,
                placeholder: field.type === "text" ? field.placeholder.trim() : undefined
            }))
            .filter((field) => field.label);

        if (!trimmedName) {
            setError("Log type name is required.");
            return;
        }

        if (normalizedFields.length === 0) {
            setError("Add at least one field to this log type.");
            return;
        }

        setIsSaving(true);
        setError("");

        try {
            const createdLogTypeId = await createUserLogType({
                ownerId: userId,
                name: trimmedName,
                fields: normalizedFields
            });

            navigate(returnTo, {
                state: {
                    createdLogTypeId
                }
            });
        } catch (submitError) {
            setError(submitError.message || "Unable to create the log type.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
        <main className="page page--log-type-builder">
            <section className="page-header">
                <div>
                    <Link className="page-header__back-link" to={returnTo}>
                        Back
                    </Link>
                    <h2>Create a custom log type</h2>
                    <p>
                        Build the shared form once, then reuse it anywhere you need to log the same kind of event.
                    </p>
                </div>
                <div className="page-header__actions">
                    {trackerId && !isLoadingTracker && (
                        <div className="page-header__meta">
                            <span className="tracker-card__badge">
                                {trackerName || "Tracker"}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {!authResolved && (
                <section className="panel panel--centered">
                    <p>Checking your session...</p>
                </section>
            )}

            {authResolved && !userId && (
                <section className="panel panel--centered">
                    <h3>No signed-in user</h3>
                    <p>Sign in first so the new log type can be saved to your account.</p>
                </section>
            )}

            {authResolved && userId && (
                <form className="log-type-builder" onSubmit={handleSave}>
                    <div className="log-type-builder__main">
                        <section className="builder-section builder-section--spotlight">
                            <div>
                                <p className="section-label">Name</p>
                                <h3>What is this log type called?</h3>
                            </div>

                            <label className="field-group">
                                <span>Custom log type name</span>
                                <input
                                    placeholder="Fertilizer treatment"
                                    required
                                    value={draftName}
                                    onChange={(event) => setDraftName(event.target.value)}
                                />
                            </label>
                        </section>

                        <section className="builder-section">
                            <div className="builder-section__header">
                                <div>
                                    <p className="section-label">Field types</p>
                                    <h3>Add fields to your log type</h3>
                                </div>
                            </div>

                            <div className="field-type-grid">
                                {AVAILABLE_FIELD_TYPES.map((fieldType) => (
                                    <button
                                        className="field-type-card"
                                        key={fieldType.value}
                                        onClick={() => addField(fieldType.value)}
                                        type="button"
                                    >
                                        <strong>{fieldType.label}</strong>
                                        <span>{fieldType.description}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="builder-section">
                            <div className="builder-section__header">
                                <div>
                                    <p className="section-label">Active fields</p>
                                    <h3>Arrange and refine your form</h3>
                                </div>
                            </div>

                            {fields.length === 0 && (
                                <div className="empty-state">
                                    <h4>No active fields yet</h4>
                                    <p>Select a field type above to start building the log form.</p>
                                </div>
                            )}

                            {fields.length > 0 && (
                                <div className="builder-stack">
                                    {fields.map((field, index) => (
                                        <article
                                            className={`active-field-card${draggedFieldId === field.id ? " active-field-card--dragging" : ""}`}
                                            draggable
                                            key={field.id}
                                            onDragEnd={() => setDraggedFieldId("")}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDragStart={() => handleDragStart(field.id)}
                                            onDrop={() => handleDrop(field.id)}
                                        >
                                            <div className="active-field-card__header">
                                                <div>
                                                    <p className="section-label">Field {index + 1}</p>
                                                    <h4>{field.label || "Untitled field"}</h4>
                                                </div>
                                                <span className="tracker-card__badge">
                                                    {formatFieldTypeLabel(field.type)}
                                                </span>
                                            </div>

                                            <div className="active-field-card__footer">
                                                <span className="active-field-card__drag-hint">Drag to reorder</span>
                                                <div className="card-actions">
                                                    <button
                                                        className="button button--ghost"
                                                        onClick={() => setActiveFieldId(field.id)}
                                                        type="button"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="button button--ghost-danger"
                                                        onClick={() => removeField(field.id)}
                                                        type="button"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="builder-section">
                            <div className="builder-section__header">
                                <div>
                                    <p className="section-label">Field editor</p>
                                    <h3>{activeField ? `Edit ${activeField.label || "field"}` : "Select a field card"}</h3>
                                </div>
                            </div>

                            {!activeField && (
                                <p className="status-message">Choose a field card to edit its details.</p>
                            )}

                            {activeField && (
                                <div className="builder-grid builder-grid--two-columns">
                                    <label className="field-group">
                                        <span>Field name</span>
                                        <input
                                            placeholder="Field label"
                                            value={activeField.label}
                                            onChange={(event) =>
                                                updateField(activeField.id, { label: event.target.value })
                                            }
                                        />
                                    </label>

                                    <label className="field-group">
                                        <span>Field type</span>
                                        <input disabled value={formatFieldTypeLabel(activeField.type)} />
                                    </label>

                                    {activeField.type === "text" && (
                                        <label className="field-group">
                                            <span>Placeholder</span>
                                            <input
                                                placeholder="Enter a response"
                                                value={activeField.placeholder}
                                                onChange={(event) =>
                                                    updateField(activeField.id, { placeholder: event.target.value })
                                                }
                                            />
                                        </label>
                                    )}

                                    <label className="field-group field-group--checkbox field-group--checkbox-card">
                                        <input
                                            checked={activeField.required}
                                            type="checkbox"
                                            onChange={(event) =>
                                                updateField(activeField.id, { required: event.target.checked })
                                            }
                                        />
                                        <span>Required field</span>
                                    </label>
                                </div>
                            )}
                        </section>

                        {error && <p className="status-message status-message--error">{error}</p>}

                        <div className="log-type-builder__actions">
                            <Link className="button button--secondary" to={returnTo}>
                                Cancel
                            </Link>
                            <button className="button button--primary" disabled={isSaving || !authResolved} type="submit">
                                {isSaving ? "Saving..." : "Create log type"}
                            </button>
                        </div>
                    </div>

                    <aside className="log-type-builder__preview panel">
                        <div className="builder-section__header">
                            <div>
                                <p className="section-label">Live preview</p>
                                <h3>{draftName.trim() || "Untitled log type"}</h3>
                            </div>
                        </div>

                        <div className="preview-panel">
                            {fields.length === 0 && (
                                <p className="status-message">Your preview will appear here once you add fields.</p>
                            )}

                            {fields.map((field) => (
                                <label className="field-group" key={field.id}>
                                    <span>
                                        {field.label || "Untitled field"}
                                        {field.required ? " *" : ""}
                                    </span>

                                    {field.type === "checkbox" ? (
                                        <span className="preview-toggle">
                                            <input checked={Boolean(previewValueByType.checkbox)} readOnly type="checkbox" />
                                            <span>Yes</span>
                                        </span>
                                    ) : (
                                        <input
                                            placeholder={field.type === "text" ? field.placeholder || "Enter a response" : ""}
                                            readOnly
                                            type={field.type}
                                            value={previewValueByType[field.type] ?? ""}
                                        />
                                    )}
                                </label>
                            ))}

                            {fields.length > 0 && (
                                <label className="field-group">
                                    <span>Notes</span>
                                    <textarea
                                        placeholder="Add any extra details for this log entry"
                                        readOnly
                                        rows={4}
                                    />
                                </label>
                            )}
                        </div>
                    </aside>
                </form>
            )}
        </main>
        {confirmationDialog}
        </>
    );
};

export default LogTypeBuilder;