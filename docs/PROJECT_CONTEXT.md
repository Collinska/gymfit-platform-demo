# GYMFIT Platform Context

## Overview

GYMFIT is a production-oriented gym operations platform integrated with FusionERP8.

FusionERP8 remains the source of truth for:

* customer information
* memberships
* financial records

The platform provides:

* operational check-in kiosk
* attendance tracking
* dashboard
* reports
* membership monitoring

---

# Core Architecture

FusionERP8 SQL Server
→ Python Sync Worker
→ Supabase
→ Next.js Platform

The operational platform must never depend directly on FusionERP for real-time kiosk operations.

Supabase acts as the operational database layer.

---

# Current Priorities

1. Dashboard
2. Operational kiosk
3. Reporting system

---

# Kiosk Philosophy

The kiosk is designed as a gym entrance operational access terminal.

Primary goals:

* fast check-ins
* operational reliability
* visual verification
* attendance tracking

Features:

* QR code scanning
* webcam support
* access granted/denied states
* attendance logging

---

# Engineering Principles

* Operational reliability over flashy design
* Fast kiosk performance
* Maintainable architecture
* Production-oriented systems
* Avoid overengineering
* Future multi-branch support
* Future face recognition support
* Future offline support
