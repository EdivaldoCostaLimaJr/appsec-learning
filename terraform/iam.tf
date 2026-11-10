resource "aws_iam_policy" "admin" {
  name = "corp-admin"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

resource "aws_iam_user" "ci" {
  name = "ci-deployer"
}

resource "aws_iam_access_key" "ci" {
  user = aws_iam_user.ci.name
}

resource "aws_iam_user_policy_attachment" "ci_admin" {
  user       = aws_iam_user.ci.name
  policy_arn = aws_iam_policy.admin.arn
}

resource "aws_iam_role" "lambda" {
  name = "lambda-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "*" }
      Action    = "sts:AssumeRole"
    }]
  })
}
