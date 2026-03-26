import { db } from "../firebase";

import {
    addDoc,
    collection,
    deleteField,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "firebase/firestore";

const TRACKERS_COLLECTION = "trackers";
const LOG_TYPES_COLLECTION = "logTypes";
const LOGS_COLLECTION = "logs";

const assertRequired = (value, fieldName) => {
    if (!value) {
        throw new Error(`${fieldName} is required.`);
    }
};

const isPlainObject = (value) => {
    if (!value || typeof value !== "object") {
        return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype;
};

const toPlainObject = (value) => {
    if (!isPlainObject(value)) {
        return {};
    }

    return value;
};

const removeUndefinedDeep = (value) => {
    if (Array.isArray(value)) {
        return value
            .map(removeUndefinedDeep)
            .filter((item) => item !== undefined);
    }

    if (isPlainObject(value)) {
        return Object.entries(value).reduce((accumulator, [key, currentValue]) => {
            if (currentValue === undefined) {
                return accumulator;
            }

            accumulator[key] = removeUndefinedDeep(currentValue);
            return accumulator;
        }, {});
    }

    return value;
};

const createId = () => {
    const cryptoSource = typeof window !== "undefined" ? window.crypto : null;

    if (cryptoSource?.randomUUID) {
        return cryptoSource.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeText = (value, fallback = "") => {
    if (typeof value === "string") {
        return value.trim();
    }

    return fallback;
};

const normalizeFieldKey = (value) => {
    const normalized = normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    return normalized || `field_${createId().slice(0, 8)}`;
};

const mapSnapshot = (snapshot) => {
    if (!snapshot.exists()) {
        return null;
    }

    return { id: snapshot.id, ...snapshot.data() };
};

const stripLegacyTrackerCategory = (tracker) => {
    if (!tracker) {
        return null;
    }

    const { category, ...trackerWithoutCategory } = tracker;

    return trackerWithoutCategory;
};

const normalizeTrackerPayload = (data = {}) => {
    const input = toPlainObject(data);
    const name = normalizeText(input.name);

    assertRequired(name, "Tracker name");
    assertRequired(input.ownerId, "ownerId");

    return removeUndefinedDeep({
        ownerId: input.ownerId,
        name,
        icon: normalizeText(input.icon),
        color: normalizeText(input.color),
        defaultLogTypeId: input.defaultLogTypeId || null,
        isArchived: Boolean(input.isArchived),
        settings: toPlainObject(input.settings),
        metadata: toPlainObject(input.metadata)
    });
};

const normalizeTrackerUpdatePayload = (data = {}) => {
    const input = toPlainObject(data);
    const payload = {};

    if (Object.prototype.hasOwnProperty.call(input, "name")) {
        const name = normalizeText(input.name);
        assertRequired(name, "Tracker name");
        payload.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(input, "icon")) {
        payload.icon = normalizeText(input.icon);
    }

    if (Object.prototype.hasOwnProperty.call(input, "color")) {
        payload.color = normalizeText(input.color);
    }

    if (Object.prototype.hasOwnProperty.call(input, "defaultLogTypeId")) {
        payload.defaultLogTypeId = input.defaultLogTypeId || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "isArchived")) {
        payload.isArchived = Boolean(input.isArchived);
    }

    if (Object.prototype.hasOwnProperty.call(input, "settings")) {
        payload.settings = toPlainObject(input.settings);
    }

    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
        payload.metadata = toPlainObject(input.metadata);
    }

    return removeUndefinedDeep(payload);
};

const normalizeLogTypeField = (field = {}) => {
    const input = toPlainObject(field);
    const label = normalizeText(input.label || input.name || input.key);
    const key = normalizeFieldKey(input.key || label || input.id);

    assertRequired(label, "Log type field label");

    return removeUndefinedDeep({
        id: input.id || createId(),
        key,
        label,
        type: normalizeText(input.type, "text") || "text",
        required: Boolean(input.required),
        unitLabel: normalizeText(input.unitLabel),
        placeholder: normalizeText(input.placeholder),
        helpText: normalizeText(input.helpText),
        options: Array.isArray(input.options)
            ? input.options
                  .map((option) => normalizeText(option))
                  .filter(Boolean)
            : []
    });
};

const normalizeLogTypePayload = (data = {}) => {
    const input = toPlainObject(data);
    const name = normalizeText(input.name);

    assertRequired(name, "Log type name");
    assertRequired(input.ownerId, "ownerId");

    return removeUndefinedDeep({
        ownerId: input.ownerId,
        name,
        fields: Array.isArray(input.fields)
            ? input.fields.map(normalizeLogTypeField)
            : [],
        settings: toPlainObject(input.settings),
        metadata: toPlainObject(input.metadata)
    });
};

const normalizeLogTypeUpdatePayload = (data = {}) => {
    const input = toPlainObject(data);
    const payload = {};

    if (Object.prototype.hasOwnProperty.call(input, "name")) {
        const name = normalizeText(input.name);
        assertRequired(name, "Log type name");
        payload.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(input, "fields")) {
        payload.fields = Array.isArray(input.fields)
            ? input.fields.map(normalizeLogTypeField)
            : [];
    }

    if (Object.prototype.hasOwnProperty.call(input, "settings")) {
        payload.settings = toPlainObject(input.settings);
    }

    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
        payload.metadata = toPlainObject(input.metadata);
    }

    return removeUndefinedDeep(payload);
};

const normalizeLogPayload = (data = {}) => {
    const input = toPlainObject(data);
    const values = toPlainObject(input.values);

    return removeUndefinedDeep({
        logTypeId: input.logTypeId || null,
        title: normalizeText(input.title),
        notes: normalizeText(input.notes),
        values,
        eventDate: input.eventDate || null,
        eventTime: input.eventTime || null,
        loggedAt: input.loggedAt || null,
        metadata: toPlainObject(input.metadata)
    });
};

const normalizeLogUpdatePayload = (data = {}) => {
    const input = toPlainObject(data);
    const payload = {};

    if (Object.prototype.hasOwnProperty.call(input, "logTypeId")) {
        payload.logTypeId = input.logTypeId || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "title")) {
        payload.title = normalizeText(input.title);
    }

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
        payload.notes = normalizeText(input.notes);
    }

    if (Object.prototype.hasOwnProperty.call(input, "values")) {
        payload.values = toPlainObject(input.values);
    }

    if (Object.prototype.hasOwnProperty.call(input, "eventDate")) {
        payload.eventDate = input.eventDate || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "eventTime")) {
        payload.eventTime = input.eventTime || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "loggedAt")) {
        payload.loggedAt = input.loggedAt || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
        payload.metadata = toPlainObject(input.metadata);
    }

    return removeUndefinedDeep(payload);
};

const listSnapshots = async (collectionRef, filters = []) => {
    const queryArgs = filters.filter(Boolean);
    const snapshot = queryArgs.length
        ? await getDocs(query(collectionRef, ...queryArgs))
        : await getDocs(collectionRef);

    return snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...snapshotDoc.data()
    }));
};

export const trackersCollection = () => {
    return collection(db, TRACKERS_COLLECTION);
};

export const trackerDoc = (trackerId) => {
    assertRequired(trackerId, "trackerId");
    return doc(db, TRACKERS_COLLECTION, trackerId);
};

export const logTypesCollection = () => {
    return collection(db, LOG_TYPES_COLLECTION);
};

export const logTypeDoc = (logTypeId) => {
    assertRequired(logTypeId, "logTypeId");
    return doc(db, LOG_TYPES_COLLECTION, logTypeId);
};

const legacyTrackerLogTypesCollection = (trackerId) => {
    assertRequired(trackerId, "trackerId");
    return collection(db, TRACKERS_COLLECTION, trackerId, LOG_TYPES_COLLECTION);
};

export const logsCollection = (trackerId) => {
    assertRequired(trackerId, "trackerId");
    return collection(db, TRACKERS_COLLECTION, trackerId, LOGS_COLLECTION);
};

export const logDoc = (trackerId, logId) => {
    assertRequired(logId, "logId");
    return doc(db, TRACKERS_COLLECTION, trackerId, LOGS_COLLECTION, logId);
};

export const listUserTrackers = async (userId) => {
    if (!userId) {
        return [];
    }

    const trackers = await listSnapshots(trackersCollection(), [where("ownerId", "==", userId)]);

    return trackers.map(stripLegacyTrackerCategory);
};

const migrateLegacyLogTypesForUser = async (userId) => {
    if (!userId) {
        return;
    }

    const [trackers, existingLogTypes] = await Promise.all([
        listUserTrackers(userId),
        listSnapshots(logTypesCollection(), [where("ownerId", "==", userId)])
    ]);
    const existingLogTypeIds = new Set(existingLogTypes.map((logType) => logType.id));

    for (const tracker of trackers) {
        const legacyLogTypes = await listSnapshots(legacyTrackerLogTypesCollection(tracker.id));

        for (const legacyLogType of legacyLogTypes) {
            if (existingLogTypeIds.has(legacyLogType.id)) {
                continue;
            }

            const payload = {
                ...normalizeLogTypePayload({
                    ...legacyLogType,
                    ownerId: userId
                }),
                dateCreated: legacyLogType.dateCreated || serverTimestamp(),
                dateUpdated: legacyLogType.dateUpdated || serverTimestamp()
            };

            await setDoc(logTypeDoc(legacyLogType.id), payload);
            existingLogTypeIds.add(legacyLogType.id);
        }
    }
};

export const getTracker = async (trackerId) => {
    const snapshot = await getDoc(trackerDoc(trackerId));
    return stripLegacyTrackerCategory(mapSnapshot(snapshot));
};

export const createTracker = async (data = {}) => {
    const payload = {
        ...normalizeTrackerPayload(data),
        dateCreated: serverTimestamp(),
        dateUpdated: serverTimestamp()
    };

    const trackerRef = await addDoc(trackersCollection(), payload);

    return trackerRef.id;
};

export const updateTracker = async (trackerId, data = {}) => {
    const payload = normalizeTrackerUpdatePayload(data);

    await updateDoc(trackerDoc(trackerId), {
        ...payload,
        category: deleteField(),
        dateUpdated: serverTimestamp()
    });

    return trackerId;
};

export const deleteTracker = async (trackerId) => {
    const existingLogs = await listTrackerLogs(trackerId);

    await Promise.all(existingLogs.map((currentLog) => deleteDoc(logDoc(trackerId, currentLog.id))));

    await deleteDoc(trackerDoc(trackerId));
};

export const listUserLogTypes = async (userId) => {
    if (!userId) {
        return [];
    }

    await migrateLegacyLogTypesForUser(userId);
    return listSnapshots(logTypesCollection(), [where("ownerId", "==", userId)]);
};

export const getLogType = async (logTypeId) => {
    const snapshot = await getDoc(logTypeDoc(logTypeId));
    return mapSnapshot(snapshot);
};

export const createUserLogType = async (data = {}) => {
    const payload = {
        ...normalizeLogTypePayload(data),
        dateCreated: serverTimestamp(),
        dateUpdated: serverTimestamp()
    };
    const reference = await addDoc(logTypesCollection(), payload);

    return reference.id;
};

export const updateUserLogType = async (logTypeId, data = {}) => {
    const payload = normalizeLogTypeUpdatePayload(data);

    await updateDoc(logTypeDoc(logTypeId), {
        ...payload,
        dateUpdated: serverTimestamp()
    });

    return logTypeId;
};

export const deleteUserLogType = async (userId, logTypeId, options = {}) => {
    const shouldDeleteAssociatedLogs = Boolean(options.deleteAssociatedLogs);
    const trackers = await listUserTrackers(userId);
    const logsByTracker = await Promise.all(
        trackers.map(async (tracker) => ({
            trackerId: tracker.id,
            logs: await listTrackerLogs(tracker.id, { logTypeId })
        }))
    );
    const associatedLogs = logsByTracker.flatMap((entry) => entry.logs);

    if (associatedLogs.length > 0 && !shouldDeleteAssociatedLogs) {
        throw new Error(
            "Cannot delete a log type that still has logs. Pass { deleteAssociatedLogs: true } to remove them too."
        );
    }

    if (shouldDeleteAssociatedLogs) {
        await Promise.all(
            logsByTracker.flatMap((entry) =>
                entry.logs.map((currentLog) => deleteDoc(logDoc(entry.trackerId, currentLog.id)))
            )
        );
    }

    await Promise.all(
        trackers
            .filter((tracker) => tracker.defaultLogTypeId === logTypeId)
            .map((tracker) =>
                updateDoc(trackerDoc(tracker.id), {
                    defaultLogTypeId: null,
                    dateUpdated: serverTimestamp()
                })
            )
    );

    await deleteDoc(logTypeDoc(logTypeId));
};

export const listTrackerLogTypes = async (trackerId) => {
    const tracker = await getTracker(trackerId);
    return listUserLogTypes(tracker?.ownerId);
};

export const getTrackerLogType = async (trackerId, logTypeId) => {
    void trackerId;
    return getLogType(logTypeId);
};

export const createTrackerLogType = async (trackerId, data = {}) => {
    const tracker = await getTracker(trackerId);
    return createUserLogType({
        ...data,
        ownerId: tracker?.ownerId
    });
};

export const updateTrackerLogType = async (trackerId, logTypeId, data = {}) => {
    void trackerId;
    return updateUserLogType(logTypeId, data);
};

export const deleteTrackerLogType = async (
    trackerId,
    logTypeId,
    options = {}
) => {
    const tracker = await getTracker(trackerId);
    return deleteUserLogType(tracker?.ownerId, logTypeId, options);
};

export const listTrackerLogs = async (trackerId, filters = {}) => {
    const queryFilters = [];

    if (filters.logTypeId) {
        queryFilters.push(where("logTypeId", "==", filters.logTypeId));
    }

    return listSnapshots(logsCollection(trackerId), queryFilters);
};

export const getTrackerLog = async (trackerId, logId) => {
    const snapshot = await getDoc(logDoc(trackerId, logId));
    return mapSnapshot(snapshot);
};

export const createTrackerLog = async (trackerId, data = {}) => {
    const payload = {
        ...normalizeLogPayload(data),
        dateCreated: serverTimestamp(),
        dateUpdated: serverTimestamp()
    };
    const reference = await addDoc(logsCollection(trackerId), payload);

    return reference.id;
};

export const updateTrackerLog = async (trackerId, logId, data = {}) => {
    const payload = normalizeLogUpdatePayload(data);

    await updateDoc(logDoc(trackerId, logId), {
        ...payload,
        dateUpdated: serverTimestamp()
    });

    return logId;
};

export const deleteTrackerLog = async (trackerId, logId) => {
    await deleteDoc(logDoc(trackerId, logId));
};

export const addLog = (trackerId, data) => {
    return createTrackerLog(trackerId, data);
};

export const updateLog = (trackerId, logId, data) => {
    return updateTrackerLog(trackerId, logId, data);
};

export const deleteLog = (trackerId, logId) => {
    return deleteTrackerLog(trackerId, logId);
};