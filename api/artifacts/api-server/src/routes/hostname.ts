import { Router, type IRouter, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../lib/firebase.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";
import {
  syncOrgToEdgeConfigAsync,
  removeHostnamesFromEdgeConfigAsync,
} from "../lib/edgeConfig.js";
import { invalidateHostname } from "../lib/hostnameCache.js";
import { getOrgDoc } from "../lib/orgCache.js";

const router: IRouter = Router();

function formatHostnameId(hostname: string): string {
  return hostname.replace(/[.\-]/g, "_");
}

function normalizeHostname(raw: string): string {
  let h = raw.trim().toLowerCase();
  // Strip protocol if present
  h = h.replace(/^https?:\/\//, "");
  // Strip trailing slashes and paths
  h = h.split("/")[0];
  return h;
}

function isValidHostname(hostname: string): boolean {
  // Must look like a valid domain (at least one dot, no spaces, no invalid chars)
  return /^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?$/.test(hostname) &&
    hostname.includes(".") &&
    !hostname.includes("..");
}

router.get(
  "/hostname",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    const orgDoc = await firestore.collection("orgs").doc(orgId).get();
    if (!orgDoc.exists) {
      res.status(404).json({ error: "Org not found" });
      return;
    }

    const orgData = orgDoc.data()!;
    const hostnameData = orgData.hostname as { url?: string; type?: string } | undefined;
    if (!hostnameData?.url) {
      res.status(404).json({ error: "No hostname found for this org" });
      return;
    }

    const docId = formatHostnameId(hostnameData.url);
    res.json({ docId, hostname: hostnameData.url, org: orgId, type: hostnameData.type });
  },
);

router.post(
  "/hostname",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { hostname: rawHostname, org: orgId, type } = req.body as {
      hostname?: string;
      org?: string;
      type?: string;
    };

    if (!rawHostname || !orgId || !type) {
      res.status(400).json({ error: "hostname, org, and type are required" });
      return;
    }

    if (type !== "subdomain") {
      res.status(400).json({ error: "type must be 'subdomain'" });
      return;
    }

    const hostname = normalizeHostname(rawHostname);

    if (!isValidHostname(hostname)) {
      res.status(400).json({ error: "Invalid hostname format" });
      return;
    }

    const docId = formatHostnameId(hostname);

    // Check for existing hostname document
    const existingDoc = await firestore.collection("hostnames").doc(docId).get();
    if (existingDoc.exists) {
      res.status(409).json({ error: "Hostname already exists" });
      return;
    }

    // Create the new hostname document
    await firestore.collection("hostnames").doc(docId).set({
      hostname,
      org: orgId,
      type,
    });

    // Update the org document with the hostname map
    await firestore.collection("orgs").doc(orgId).update({
      "hostname.url": hostname,
      "hostname.type": type,
    });

    invalidateHostname(hostname);

    res.status(201).json({ docId, hostname, org: orgId, type });

    syncOrgToEdgeConfigAsync(orgId);

    // Async: delete any old hostname docs for this org (excluding the new one)
    firestore
      .collection("hostnames")
      .where("org", "==", orgId)
      .get()
      .then((snapshot) => {
        const oldDocs = snapshot.docs.filter((doc) => doc.id !== docId);
        const oldHostnames = oldDocs
          .map((doc) => doc.data().hostname as string | undefined)
          .filter((h): h is string => !!h);
        const deletions = oldDocs.map((doc) => doc.ref.delete());
        return Promise.all(deletions).then(() => {
          oldHostnames.forEach(invalidateHostname);
          removeHostnamesFromEdgeConfigAsync(oldHostnames);
        });
      })
      .catch(() => {
        // Silent — old hostname cleanup is best-effort
      });
  },
);

router.post(
  "/customDomain",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { domain: rawDomain } = req.body as {
      domain?: string;
    };

    if (!rawDomain) {
      res.status(400).json({ error: "domain is required" });
      return;
    }

    const uid = req.uid!;
    const userDoc = await firestore.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = userDoc.data()?.org;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    const domain = normalizeHostname(rawDomain);

    if (!isValidHostname(domain)) {
      res.status(400).json({ error: "Invalid domain format" });
      return;
    }

    const docId = formatHostnameId(domain);

    const existingDoc = await firestore.collection("customDomains").doc(docId).get();
    if (existingDoc.exists) {
      res.status(409).json({ error: "Custom domain already exists" });
      return;
    }

    await firestore.collection("customDomains").doc(docId).set({
      url: domain,
      org: orgId,
      type: "customDomain",
    });

    await firestore.collection("orgs").doc(orgId).update({
      "customDomain.url": domain,
      "customDomain.type": "customDomain",
    });

    invalidateHostname(domain);

    res.status(201).json({ docId, url: domain, org: orgId, type: "customDomain" });

    syncOrgToEdgeConfigAsync(orgId);
  },
);

router.post(
  "/customDomain/delete",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { domain: rawDomain } = req.body as {
      domain?: string;
    };

    if (!rawDomain) {
      res.status(400).json({ error: "domain is required" });
      return;
    }

    const uid = req.uid!;
    const userDoc = await firestore.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = userDoc.data()?.org;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    const domain = normalizeHostname(rawDomain);
    const docId = formatHostnameId(domain);

    const customDomainDoc = await firestore.collection("customDomains").doc(docId).get();
    if (!customDomainDoc.exists) {
      res.status(404).json({ error: "Custom domain not found" });
      return;
    }

    if (customDomainDoc.data()?.org !== orgId) {
      res.status(403).json({ error: "Custom domain does not belong to your org" });
      return;
    }

    await firestore.collection("customDomains").doc(docId).delete();

    await firestore.collection("orgs").doc(orgId).update({
      customDomain: FieldValue.delete(),
    });

    invalidateHostname(domain);

    res.status(200).json({ success: true, docId });

    removeHostnamesFromEdgeConfigAsync([domain]);
  },
);

router.post(
  "/hostcheck",
  async (req: Request, res: Response): Promise<void> => {
    const { hostname: rawHostname } = req.body as { hostname?: string };

    if (!rawHostname) {
      res.status(400).json({ error: "hostname is required" });
      return;
    }

    const hostname = normalizeHostname(rawHostname);

    const LOCALHOST_DEFAULT_ORG_ID = "f3c62f7c-0b63-4a95-87bb-255beac0054f";
    const FEEDCHAT_SUBDOMAIN = "app.feedchat.io";

    let orgId: string | undefined;

    if (hostname.split(":")[0] === "localhost") {
      // Case 1: localhost — use default dev org
      orgId = LOCALHOST_DEFAULT_ORG_ID;
    } else {
      if (!isValidHostname(hostname)) {
        res.json({ valid: false });
        return;
      }

      const docId = formatHostnameId(hostname);

      if (hostname === FEEDCHAT_SUBDOMAIN || hostname.endsWith(`.${FEEDCHAT_SUBDOMAIN}`)) {
        // Case 2: subdomain of *.app.feedchat.io — look up in hostnames collection
        const hostnameDoc = await firestore.collection("hostnames").doc(docId).get();
        if (!hostnameDoc.exists) {
          res.json({ valid: false });
          return;
        }
        orgId = hostnameDoc.data()?.org as string | undefined;
      } else {
        // Case 3: custom domain (e.g. feedback.tenant.com) — look up in customDomains collection
        const customDomainDoc = await firestore.collection("customDomains").doc(docId).get();
        if (!customDomainDoc.exists) {
          res.json({ valid: false });
          return;
        }
        orgId = customDomainDoc.data()?.org as string | undefined;
      }
    }

    if (!orgId) {
      res.json({ valid: false });
      return;
    }

    const orgData = await getOrgDoc(orgId);

    if (!orgData) {
      res.json({ valid: false });
      return;
    }

    const activePlans = ["start", "scale", "pro"];
    const plan = orgData.plan as string | undefined;

    const name = ((orgData.companyName || orgData.name) as string | undefined) ?? null;
    const website = (orgData.website as string | undefined) ?? null;
    const supportLink = (orgData.supportLink as string | undefined) ?? null;
    const colorPalette = (orgData.colorPalette as string | undefined) ?? null;
    const accentColor = (orgData.accentColor as string | undefined) ?? null;

    res.json({
      valid: activePlans.includes(plan ?? ""),
      name,
      website,
      supportLink,
      colorPalette,
      accentColor,
    });
  },
);

export default router;
