BOARDSIGHT CHESS — AWS DEPLOYMENT (S3 + CLOUDFRONT + ROUTE 53)

Domain: boardsightchess.com (registered/hosted in Route 53)
Architecture: Route 53 -> CloudFront (HTTPS via ACM) -> S3 (private origin)

ONE-TIME SETUP

1. Create the S3 bucket
   - Bucket name: boardsightchess.com (or similar).
   - Block all public access: ON. The bucket stays private; CloudFront reads
     it through an Origin Access Control, not a public bucket policy.

2. Request an ACM certificate
   - Must be requested in the us-east-1 region for CloudFront to use it.
   - Certificate Manager > Request certificate > boardsightchess.com and
     www.boardsightchess.com.
   - Validate via DNS — ACM can write the validation CNAME directly into
     Route 53.

3. Create a CloudFront distribution
   - Origin: the S3 bucket, using Origin Access Control (OAC) so the bucket
     stays private.
   - Alternate domain names (CNAMEs): boardsightchess.com and
     www.boardsightchess.com.
   - Custom SSL certificate: the ACM cert from step 2.
   - Default root object: index.html.
   - Viewer protocol policy: Redirect HTTP to HTTPS.
   - Response headers policy: create a custom policy that sets
       X-Content-Type-Options: nosniff
       Referrer-Policy: strict-origin-when-cross-origin
       Permissions-Policy: camera=(), microphone=(), geolocation=()
     and attach it to the default cache behavior.

4. Point the domain at CloudFront in Route 53
   - In the boardsightchess.com hosted zone, create Alias A and AAAA records
     for both boardsightchess.com and www.boardsightchess.com targeting the
     CloudFront distribution.

UPLOADING / UPDATING THE SITE

  aws s3 sync . s3://boardsightchess.com \
    --exclude ".git/*" --exclude "README-DEPLOY.txt" --exclude "CLAUDE.md" \
    --delete

  aws s3 cp site.webmanifest s3://boardsightchess.com/site.webmanifest \
    --content-type "application/manifest+json"

  aws cloudfront create-invalidation \
    --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"

  site.webmanifest needs its content type set explicitly — the AWS CLI's
  default MIME lookup does not recognize the .webmanifest extension and will
  otherwise upload it as application/octet-stream, which breaks PWA install.

  The cache invalidation step is what makes edits go live immediately instead
  of waiting out CloudFront's cache TTL.

NOTES
- The Cloudflare Pages deployment described in earlier versions of this file
  no longer applies; hosting moved to S3 + CloudFront as described above.
- The interface has layouts for desktop, tablet portrait, mobile portrait, and
  short landscape phone screens.
- The code includes optional GA4 event hooks for game starts, ad opportunities,
  ad closes, and take-backs. Those hooks do nothing unless a GA4 tag is added.
