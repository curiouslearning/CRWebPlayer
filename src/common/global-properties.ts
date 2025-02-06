// The Global Properties file describes the properties that are shared across multiple files in the project.

const urlParams = new URLSearchParams(window.location.search);

export var crUserId: string = urlParams.get("cr_user_id") || "unknown";
export var campaignSource: string = urlParams.get("source") || "unknown";
export var campaignId: string = urlParams.get("campaign_id") || "unknown";
