import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

const DOMAIN_NAME = 'hawkeyecue.com';
const WWW_DOMAIN = `www.${DOMAIN_NAME}`;

export class FrontendStack extends cdk.Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── WAF Web ACL ──────────────────────────────────────────────────────
    // scope must be CLOUDFRONT and the stack must be in us-east-1
    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'SocialLeadGen-CloudFront-WAF',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'SocialLeadGen-WAF',
        sampledRequestsEnabled: true,
      },
      rules: [
        // 1. AWS Common Rule Set — OWASP Top 10: SQLi, XSS, bad inputs
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 10,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },

        // 2. Known Bad Inputs — Log4j, SSRF, path traversal
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 20,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },

        // 3. IP Reputation List — botnets, scrapers, Amazon threat intel
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 30,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesAmazonIpReputationList',
            sampledRequestsEnabled: true,
          },
        },

        // 4. Rate limit — 1000 req / 5 min per IP site-wide
        {
          name: 'RateLimitPerIp',
          priority: 40,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitPerIp',
            sampledRequestsEnabled: true,
          },
        },

        // 5. Strict rate limit on auth endpoints — 100 req / 5 min per IP
        // Mitigates brute-force and credential stuffing on /login and /register
        {
          name: 'RateLimitAuthEndpoints',
          priority: 50,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                orStatement: {
                  statements: [
                    {
                      byteMatchStatement: {
                        fieldToMatch: { uriPath: {} },
                        positionalConstraint: 'STARTS_WITH',
                        searchString: '/login',
                        textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                      },
                    },
                    {
                      byteMatchStatement: {
                        fieldToMatch: { uriPath: {} },
                        positionalConstraint: 'STARTS_WITH',
                        searchString: '/register',
                        textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                      },
                    },
                  ],
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitAuthEndpoints',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // ─── ACM Certificate ──────────────────────────────────────────────────
    // Covers both apex and www. Must be in us-east-1 for CloudFront (matches this stack).
    // DNS validation is automatic since the hosted zone is in the same account.
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: DOMAIN_NAME,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: DOMAIN_NAME,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ─── S3 Site Bucket ───────────────────────────────────────────────────
    // Private bucket — served exclusively through CloudFront
    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Origin Access Identity for CloudFront to access S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for SocialLeadGen web frontend',
    });

    this.siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.siteBucket.arnForObjects('*')],
        principals: [originAccessIdentity.grantPrincipal],
      }),
    );

    // ─── CloudFront Response Headers Policy (Security) ──────────────────
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'SocialLeadGen-SecurityHeaders',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self'",
            "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com https://29p0xwb5v8.execute-api.us-east-1.amazonaws.com https://checkout.stripe.com",
            "frame-src https://checkout.stripe.com https://js.stripe.com",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: true, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // ─── CloudFront Distribution ──────────────────────────────────────────
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      webAclId: this.webAcl.attrArn,
      domainNames: [DOMAIN_NAME, WWW_DOMAIN],
      certificate,
      defaultBehavior: {
        origin: new origins.S3Origin(this.siteBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
        cachePolicy: new cloudfront.CachePolicy(this, 'DefaultCachePolicy', {
          defaultTtl: cdk.Duration.days(1),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
        }),
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ─── Route 53 DNS Records ─────────────────────────────────────────────
    // Apex A record (hawkeyecue.com → CloudFront)
    new route53.ARecord(this, 'ApexARecord', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution),
      ),
    });

    // www CNAME-equivalent A record (www.hawkeyecue.com → CloudFront)
    new route53.ARecord(this, 'WwwARecord', {
      zone: hostedZone,
      recordName: WWW_DOMAIN,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution),
      ),
    });

    // ─── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      description: 'WAF Web ACL ARN',
      exportName: 'SocialLeadGen-WebAclArn',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: 'SocialLeadGen-DistributionDomainName',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID (for cache invalidation on deploy)',
      exportName: 'SocialLeadGen-DistributionId',
    });

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: this.siteBucket.bucketName,
      description: 'S3 bucket name for frontend deployment',
      exportName: 'SocialLeadGen-SiteBucketName',
    });
  }
}
