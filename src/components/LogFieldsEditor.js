const AVAILABLE_FIELD_TYPES = [
    {
        value: "text",
        label: "Text",
        description: "Short text for names, places, or labels.",
        placeholder: "Enter a response"
    },
    {
        value: "textarea",
        label: "Long text",
        description: "Longer notes or descriptions.",
        placeholder: "Enter details"
    },
    {
        value: "number",
        label: "Number",
        description: "Numeric values such as counts, prices, or distances.",
        placeholder: "0"
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
        description: "A specific time for the event.",
        placeholder: ""
    },
    {
        value: "checkbox",
        label: "Checkbox",
        description: "A yes or no toggle.",
        placeholder: ""
    },
    {
        value: "select",
        label: "Select",
        description: "Choose one option from a predefined list.",
        placeholder: ""
    }
];

const createClientId = () => {
    const cryptoSource = typeof window !== "undefined" ? window.crypto : null;

    if (cryptoSource?.randomUUID) {
        return cryptoSource.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getFieldTypeDefinition = (type) => {
    return AVAILABLE_FIELD_TYPES.find((option) => option.value === type) || AVAILABLE_FIELD_TYPES[0];
};

export const createLogFieldDraft = (type = "text") => {
    const fieldType = getFieldTypeDefinition(type);

    return {
        id: createClientId(),
        label: `${fieldType.label} field`,
        type: fieldType.value,
        required: false,
        placeholder: fieldType.placeholder,
        options: []
    };
};

const serializeOptions = (options) => {
    if (!Array.isArray(options)) {
        return "";
    }

    return options.join("\n");
};

const parseOptions = (value) => {
    if (typeof value !== "string") {
        return [];
    }

    return value
        .split(/\r?\n|,/)
        .map((option) => option.trim())
        .filter(Boolean);
};

const getFieldTypeLabel = (type) => {
    return getFieldTypeDefinition(type)?.label || "Field";
};

const shouldShowPlaceholderInput = (type) => {
    return ["text", "textarea", "number"].includes(type);
};

const LogFieldsEditor = ({
    fields,
    onChange,
    emptyTitle = "No log fields yet",
    emptyDescription = "Add the fields you want every log in this tracker to collect.",
    title = "Log fields",
    description = "Define the fields each log entry should include for this tracker."
}) => {
    const addField = (type) => {
        onChange([...(fields || []), createLogFieldDraft(type)]);
    };

    const updateField = (fieldId, updates) => {
        onChange(
            (fields || []).map((field) =>
                field.id === fieldId
                    ? { ...field, ...updates }
                    : field
            )
        );
    };

    const handleTypeChange = (field, nextType) => {
        const typeDefinition = getFieldTypeDefinition(nextType);
        const nextUpdates = {
            type: nextType,
            options: nextType === "select" ? field.options || [] : [],
            placeholder: shouldShowPlaceholderInput(nextType)
                ? field.placeholder || typeDefinition.placeholder
                : ""
        };

        updateField(field.id, nextUpdates);
    };

    const removeField = (fieldId) => {
        onChange((fields || []).filter((field) => field.id !== fieldId));
    };

    return (
        <div className="builder-stack">
            <section className="builder-section">
                <div className="builder-section__header">
                    <div>
                        <p className="section-label">Field types</p>
                        <h3>{title}</h3>
                    </div>
                    <span className="tracker-card__badge">{(fields || []).length} fields</span>
                </div>

                <p>{description}</p>

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
                        <h3>Configure the log form</h3>
                    </div>
                </div>

                {(fields || []).length === 0 && (
                    <div className="empty-state">
                        <h4>{emptyTitle}</h4>
                        <p>{emptyDescription}</p>
                    </div>
                )}

                {(fields || []).length > 0 && (
                    <div className="builder-stack">
                        {(fields || []).map((field, index) => (
                            <article className="field-builder" key={field.id}>
                                <div className="field-builder__header">
                                    <div>
                                        <p className="section-label">Field {index + 1}</p>
                                        <h4>{field.label || getFieldTypeLabel(field.type)}</h4>
                                    </div>
                                    <span className="tracker-card__badge">{getFieldTypeLabel(field.type)}</span>
                                </div>

                                <div className="builder-grid builder-grid--three-columns">
                                    <label className="field-group">
                                        <span>Field label</span>
                                        <input
                                            placeholder="Mileage"
                                            required
                                            value={field.label || ""}
                                            onChange={(event) => updateField(field.id, { label: event.target.value })}
                                        />
                                    </label>

                                    <label className="field-group">
                                        <span>Field type</span>
                                        <select
                                            value={field.type || "text"}
                                            onChange={(event) => handleTypeChange(field, event.target.value)}
                                        >
                                            {AVAILABLE_FIELD_TYPES.map((fieldType) => (
                                                <option key={fieldType.value} value={fieldType.value}>
                                                    {fieldType.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <div className="field-group field-group--checkbox-card">
                                        <span>Required field</span>
                                        <label className="field-group field-group--checkbox">
                                            <input
                                                checked={Boolean(field.required)}
                                                type="checkbox"
                                                onChange={(event) =>
                                                    updateField(field.id, { required: event.target.checked })
                                                }
                                            />
                                            <span>Users must fill this in</span>
                                        </label>
                                    </div>
                                </div>

                                {shouldShowPlaceholderInput(field.type) && (
                                    <label className="field-group">
                                        <span>Placeholder</span>
                                        <input
                                            placeholder="Optional helper text"
                                            value={field.placeholder || ""}
                                            onChange={(event) =>
                                                updateField(field.id, { placeholder: event.target.value })
                                            }
                                        />
                                    </label>
                                )}

                                {field.type === "select" && (
                                    <label className="field-group">
                                        <span>Options</span>
                                        <textarea
                                            placeholder="Low&#10;Medium&#10;High"
                                            rows={4}
                                            value={serializeOptions(field.options)}
                                            onChange={(event) =>
                                                updateField(field.id, { options: parseOptions(event.target.value) })
                                            }
                                        />
                                    </label>
                                )}

                                <div className="card-actions">
                                    <button
                                        className="button button--ghost-danger"
                                        onClick={() => removeField(field.id)}
                                        type="button"
                                    >
                                        Remove field
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default LogFieldsEditor;