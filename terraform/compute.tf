resource "aws_instance" "web" {
  ami                         = "ami-0abcdef1234567890"
  instance_type               = "t3.micro"
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.web.id]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "optional"
  }

  root_block_device {
    encrypted = false
  }

  user_data = <<-EOF
    #!/bin/bash
    export DB_PASSWORD=prod-super-secreta
    export STRIPE_SECRET_KEY=sk_live_REDACTED_EXAMPLE_KEY
    export GITHUB_TOKEN=ghp_EXAMPLE_REDACTED_GITHUB_PAT
  EOF

  tags = {
    Name = "web"
  }
}

resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 20
  encrypted         = false
}
