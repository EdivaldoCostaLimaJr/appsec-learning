resource "aws_db_instance" "corp" {
  identifier              = "corp-db"
  engine                  = "mysql"
  engine_version          = "8.0"
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  username                = "admin"
  password                = "root1234"
  publicly_accessible     = true
  storage_encrypted       = false
  skip_final_snapshot     = true
  backup_retention_period = 0
  multi_az                = false
  iam_database_authentication_enabled = false
  vpc_security_group_ids  = [aws_security_group.web.id]
}
